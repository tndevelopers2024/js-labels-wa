const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const User = require('../models/User');
const FollowUp = require('../models/FollowUp');
const ExcelJS = require('exceljs');

// GET /api/leads
const getLeads = async (req, res) => {
  try {
    const { status, source, search, assignedTo, page = 1, limit = 100 } = req.query;

    // Base filter starting with ownership scope filter
    let queryFilter = { ...req.scopeFilter };

    if (status) queryFilter.status = status;
    if (source) queryFilter.source = source;

    if (search && search.trim()) {
      const q = search.trim();
      const cleanPhone = q.replace(/\D/g, '');
      queryFilter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { company: { $regex: q, $options: 'i' } },
        { phone: { $regex: cleanPhone || q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } }
      ];
    }

    // If manager/super_admin passes assignedTo, apply it unless caller scope already locks it
    if (assignedTo && req.user.role !== 'caller') {
      queryFilter.assignedTo = assignedTo;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [leads, total] = await Promise.all([
      Lead.find(queryFilter)
        .populate('assignedTo', 'name email avatarUrl role')
        .populate('createdBy', 'name email avatarUrl role')
        .populate('followUpNotesList.createdBy', 'name email avatarUrl role')
        .populate('rescheduleHistory.rescheduledBy', 'name email avatarUrl role')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Lead.countDocuments(queryFilter)
    ]);

    // Enrich follow_up leads with open FollowUp document dates if missing
    const leadIds = leads.map(l => l._id);
    const openFollowUps = await FollowUp.find({
      relatedType: 'lead',
      relatedId: { $in: leadIds },
      status: 'open'
    }).sort({ dueDate: -1 });

    const followUpMap = {};
    openFollowUps.forEach(f => {
      followUpMap[f.relatedId.toString()] = f;
    });

    const enrichedLeads = leads.map(l => {
      const leadObj = l.toObject();
      const fu = followUpMap[l._id.toString()];
      if (fu) {
        if (!leadObj.nextFollowUpDate && fu.dueDate) {
          leadObj.nextFollowUpDate = fu.dueDate;
        }
        if (!leadObj.followUpNotes && fu.notes) {
          leadObj.followUpNotes = fu.notes;
        }
      }
      return leadObj;
    });

    return res.json({
      leads: enrichedLeads,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    return res.status(500).json({ message: 'Server error fetching leads' });
  }
};

// POST /api/leads
const createLead = async (req, res) => {
  try {
    const { name, company, phone, email, source, priority, assignedTo } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ message: 'Lead name and phone number are required' });
    }

    const cleanPhone = phone.toString().replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ message: 'Phone number must be exactly 10 digits' });
    }

    if (email && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({ message: 'Please enter a valid email address' });
      }
    }

    const finalAssignedTo = req.user.role === 'caller' ? req.user.id : (assignedTo || null);
    const finalSource = (source && source.trim()) ? source.trim() : null;

    // Deduplication safeguard against rapid duplicate submissions (e.g. double/triple clicks within 4s)
    const recentDuplicate = await Lead.findOne({
      phone: cleanPhone,
      createdBy: req.user.id,
      createdAt: { $gte: new Date(Date.now() - 4000) }
    }).populate('assignedTo', 'name email avatarUrl role')
      .populate('createdBy', 'name email avatarUrl role');

    if (recentDuplicate) {
      return res.status(200).json(recentDuplicate);
    }

    const newLead = await Lead.create({
      name: name.trim(),
      company: company ? company.trim() : undefined,
      phone: cleanPhone,
      email: email ? email.trim().toLowerCase() : undefined,
      source: finalSource,
      priority: priority || 'medium',
      status: 'new',
      assignedTo: finalAssignedTo,
      createdBy: req.user.id
    });

    // Create activity audit entry
    await Activity.create({
      relatedType: 'lead',
      relatedId: newLead._id,
      type: 'status_change',
      description: 'Lead created',
      createdBy: req.user.id
    });

    const populatedLead = await Lead.findById(newLead._id)
      .populate('assignedTo', 'name email avatarUrl role')
      .populate('createdBy', 'name email avatarUrl role');

    return res.status(201).json(populatedLead);
  } catch (error) {
    console.error('Error creating lead:', error);
    return res.status(500).json({ message: 'Server error creating lead' });
  }
};

// PATCH /api/leads/:id/status
const updateLeadStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, cancelReason, followUpDate, followUpTime, notes } = req.body;

    const isOrderLostTarget = ['cancelled', 'order_lost', 'order-lost'].includes(status);
    const validStatuses = ['new', 'contacted', 'follow_up', 'won', 'cancelled', 'order_lost', 'order-lost'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid lead status' });
    }

    if (isOrderLostTarget && (!cancelReason || !cancelReason.trim())) {
      return res.status(400).json({ message: 'Reason is required when marking a lead as Order-Lost' });
    }

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Ownership check for caller
    if (req.user.role === 'caller' && lead.assignedTo?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: You can only update leads assigned to you' });
    }

    const oldStatus = lead.status || 'new';

    // Strict validation: Order-Lost can ONLY be moved to from 'contacted' or 'follow_up'
    if (isOrderLostTarget && !['contacted', 'follow_up'].includes(oldStatus)) {
      return res.status(400).json({
        message: 'Leads can only be moved to Order-Lost from Contacted or Follow-up stages'
      });
    }

    const ALLOWED_TRANSITIONS = {
      new: ['contacted', 'follow_up', 'won'],
      contacted: ['new', 'follow_up', 'won', 'cancelled', 'order_lost', 'order-lost'],
      follow_up: ['new', 'contacted', 'follow_up', 'won', 'cancelled', 'order_lost', 'order-lost'],
      won: ['new', 'contacted', 'follow_up'],
      cancelled: ['new', 'contacted', 'follow_up', 'won'],
      order_lost: ['new', 'contacted', 'follow_up', 'won'],
      'order-lost': ['new', 'contacted', 'follow_up', 'won']
    };

    if (oldStatus !== status) {
      const allowedNext = ALLOWED_TRANSITIONS[oldStatus] || [];
      if (!allowedNext.includes(status)) {
        return res.status(400).json({
          message: `Invalid lead status transition from '${oldStatus}' to '${status}'`
        });
      }
    }

    lead.status = status;
    if (isOrderLostTarget) {
      lead.cancelReason = cancelReason;
    } else {
      lead.cancelReason = undefined;
    }

    // If moving to follow_up, sync with FollowUp document and populate notes
    if (status === 'follow_up') {
      let dueDate = new Date();
      if (followUpDate && followUpTime) {
        dueDate = new Date(`${followUpDate}T${followUpTime}`);
      } else if (followUpDate) {
        dueDate = new Date(followUpDate);
      }

      const validDueDate = isNaN(dueDate.getTime()) ? new Date() : dueDate;

      lead.nextFollowUpDate = validDueDate;
      lead.followUpDate = followUpDate;
      lead.followUpTime = followUpTime;
      lead.followUpNotes = notes || '';

      if (notes && notes.trim()) {
        if (!lead.followUpNotesList) lead.followUpNotesList = [];
        lead.followUpNotesList.push({
          content: notes.trim(),
          createdAt: new Date(),
          createdBy: req.user.id
        });
      }

      let openFu = await FollowUp.findOne({ relatedType: 'lead', relatedId: lead._id, status: 'open' });
      if (openFu) {
        openFu.dueDate = validDueDate;
        openFu.notes = notes || openFu.notes;
        if (notes && notes.trim()) {
          if (!openFu.notesList) openFu.notesList = [];
          openFu.notesList.push({
            content: notes.trim(),
            createdAt: new Date(),
            createdBy: req.user.id
          });
        }
        await openFu.save();
      } else {
        await FollowUp.create({
          relatedType: 'lead',
          relatedId: lead._id,
          dueDate: validDueDate,
          notes: notes || '',
          status: 'open',
          assignedTo: lead.assignedTo || req.user.id,
          notesList: (notes && notes.trim()) ? [{
            content: notes.trim(),
            createdAt: new Date(),
            createdBy: req.user.id
          }] : []
        });
      }
    }

    await lead.save();

    // If moving to won, create a Customer document if not already existing
    if (status === 'won') {
      const Customer = require('../models/Customer');
      const existingCust = await Customer.findOne({ $or: [{ leadId: lead._id }, { phone: lead.phone }] });
      if (!existingCust) {
        await Customer.create({
          name: lead.name,
          company: lead.company,
          phone: lead.phone,
          email: lead.email,
          leadId: lead._id,
          salesExecutive: lead.assignedTo || req.user.id,
          customerType: 'Regular',
          paymentTerms: '30 Days',
          reorderProbability: 75,
          expectedReorderDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        });
      }
    }

    // Create activity audit entry
    await Activity.create({
      relatedType: 'lead',
      relatedId: lead._id,
      type: 'status_change',
      description: `Moved status from ${oldStatus} to ${status}`,
      createdBy: req.user.id
    });

    const updatedLead = await Lead.findById(lead._id)
      .populate('assignedTo', 'name email avatarUrl role')
      .populate('createdBy', 'name email avatarUrl role');

    return res.json(updatedLead);
  } catch (error) {
    console.error('Error updating lead status:', error);
    return res.status(500).json({ message: 'Server error updating lead status' });
  }
};

// PATCH /api/leads/:id/assign
const reassignLead = async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedTo } = req.body;

    if (!assignedTo) {
      return res.status(400).json({ message: 'assignedTo user ID is required' });
    }

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const targetUser = await User.findById(assignedTo);
    if (!targetUser) {
      return res.status(404).json({ message: 'Target user for assignment not found' });
    }

    lead.assignedTo = assignedTo;
    await lead.save();

    await Activity.create({
      relatedType: 'lead',
      relatedId: lead._id,
      type: 'status_change',
      description: `Reassigned lead to ${targetUser.name}`,
      createdBy: req.user.id
    });

    const updatedLead = await Lead.findById(lead._id)
      .populate('assignedTo', 'name email avatarUrl role')
      .populate('createdBy', 'name email avatarUrl role');

    return res.json(updatedLead);
  } catch (error) {
    console.error('Error reassigning lead:', error);
    return res.status(500).json({ message: 'Server error reassigning lead' });
  }
};

// POST /api/leads/:id/activity
const addLeadActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, description } = req.body;

    if (!type || !description) {
      return res.status(400).json({ message: 'Activity type and description are required' });
    }

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    if (req.user.role === 'caller' && lead.assignedTo?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: You can only add activity to your assigned leads' });
    }

    const activity = await Activity.create({
      relatedType: 'lead',
      relatedId: lead._id,
      type,
      description,
      createdBy: req.user.id
    });

    // Touch lead updatedAt timestamp
    lead.updatedAt = new Date();
    await lead.save();

    return res.status(201).json(activity);
  } catch (error) {
    console.error('Error adding activity:', error);
    return res.status(500).json({ message: 'Server error adding activity' });
  }
};

// GET /api/leads/:id
const getLeadById = async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findById(id)
      .populate('assignedTo', 'name email phone avatarUrl role')
      .populate('createdBy', 'name email phone avatarUrl role')
      .populate('followUpNotesList.createdBy', 'name email avatarUrl role')
      .populate('rescheduleHistory.rescheduledBy', 'name email avatarUrl role');

    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Ownership check for caller
    if (req.user.role === 'caller' && lead.assignedTo?._id?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: You can only view leads assigned to you' });
    }

    return res.json(lead);
  } catch (error) {
    console.error('Error fetching lead detail:', error);
    return res.status(500).json({ message: 'Server error fetching lead detail' });
  }
};

// DELETE /api/leads/:id
const deleteLead = async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    await lead.softDelete(req.user.id);

    await Activity.create({
      relatedType: 'lead',
      relatedId: lead._id,
      type: 'status_change',
      description: `Lead ${lead.name} soft deleted`,
      createdBy: req.user.id
    });

    return res.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Error deleting lead:', error);
    return res.status(500).json({ message: 'Server error deleting lead' });
  }
};

// PUT /api/leads/:id
const updateLead = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, company, phone, email, source, priority } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ message: 'Lead name and phone number are required' });
    }

    const cleanPhone = phone.toString().replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ message: 'Phone number must be exactly 10 digits' });
    }

    if (email && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({ message: 'Please enter a valid email address' });
      }
    }

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Ownership check for caller
    if (req.user.role === 'caller' && lead.assignedTo && lead.assignedTo.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: You can only update leads assigned to you' });
    }

    lead.name = name.trim();
    lead.company = company ? company.trim() : undefined;
    lead.phone = cleanPhone;
    lead.email = email ? email.trim().toLowerCase() : undefined;
    if (source !== undefined) {
      if (!source || !source.toString().trim()) {
        lead.source = null;
      } else {
        const srcStr = source.toString().trim();
        const mapped = srcStr.toLowerCase().replace(/[\s-]+/g, '_');
        const validEnums = ['website', 'referral', 'walk_in', 'google_ads', 'tele_caller', 'other'];
        lead.source = validEnums.includes(mapped) ? mapped : srcStr;
      }
    }
    if (priority) lead.priority = priority;
    if (req.body.gstNo !== undefined) lead.gstNo = req.body.gstNo;
    if (req.body.address !== undefined) lead.address = req.body.address;
    if (req.body.city !== undefined) lead.city = req.body.city;

    let parsedDate = undefined;
    if (req.body.expectedReorderDate || req.body.nextFollowUpDate || req.body.followUpDate) {
      const d = new Date(req.body.expectedReorderDate || req.body.nextFollowUpDate || req.body.followUpDate);
      if (!isNaN(d.getTime())) {
        parsedDate = d;
        lead.nextFollowUpDate = parsedDate;
      }
    }

    await lead.save();

    // 1. Sync linked Customer if exists
    const Customer = require('../models/Customer');
    let linkedCustomer = await Customer.findOne({ $or: [{ leadId: lead._id }, { phone: lead.phone }] });
    if (linkedCustomer) {
      linkedCustomer.name = lead.name;
      linkedCustomer.company = lead.company || '';
      linkedCustomer.phone = lead.phone;
      linkedCustomer.email = lead.email || '';
      if (req.body.address) linkedCustomer.address = req.body.address;
      if (req.body.city) linkedCustomer.city = req.body.city;
      if (req.body.gstNo) linkedCustomer.gstNo = req.body.gstNo;
      if (parsedDate) linkedCustomer.expectedReorderDate = parsedDate;
      await linkedCustomer.save();
    }

    // 2. Sync open FollowUp documents for lead and linked customer
    const FollowUp = require('../models/FollowUp');
    if (parsedDate) {
      await FollowUp.updateMany(
        { relatedType: 'lead', relatedId: lead._id, status: 'open' },
        { $set: { dueDate: parsedDate } }
      );
      if (linkedCustomer) {
        await FollowUp.updateMany(
          { relatedType: 'customer', relatedId: linkedCustomer._id, status: 'open' },
          { $set: { dueDate: parsedDate } }
        );
      }
    }

    if (parsedDate) {
      const formattedDateStr = parsedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      await Activity.create({
        relatedType: 'lead',
        relatedId: lead._id,
        type: 'reorder_date',
        description: `Updated Next Pre-order / Reorder date to ${formattedDateStr} (${lead.name})`,
        createdBy: req.user.id
      });
      if (linkedCustomer) {
        await Activity.create({
          relatedType: 'customer',
          relatedId: linkedCustomer._id,
          type: 'reorder_date',
          description: `Updated Next Pre-order / Reorder date to ${formattedDateStr} (${lead.name})`,
          createdBy: req.user.id
        });
      }
    } else {
      await Activity.create({
        relatedType: 'lead',
        relatedId: lead._id,
        type: 'status_change',
        description: `Updated lead details (${lead.name})`,
        createdBy: req.user.id
      });
    }

    const updatedLead = await Lead.findById(lead._id)
      .populate('assignedTo', 'name email avatarUrl role')
      .populate('createdBy', 'name email avatarUrl role')
      .populate('followUpNotesList.createdBy', 'name email avatarUrl role')
      .populate('rescheduleHistory.rescheduledBy', 'name email avatarUrl role');

    return res.json(updatedLead);
  } catch (error) {
    console.error('Error updating lead:', error);
    return res.status(500).json({ message: 'Server error updating lead' });
  }
};

// PATCH /api/leads/:id/reschedule-followup
const rescheduleFollowUp = async (req, res) => {
  try {
    const { id } = req.params;
    const { followUpDate, followUpTime, reason, notes } = req.body;

    if (!followUpDate) {
      return res.status(400).json({ message: 'Follow-up date is required' });
    }

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    if (req.user.role === 'caller' && lead.assignedTo && lead.assignedTo.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: You can only reschedule follow-ups for your assigned leads' });
    }

    let newDueDate = new Date();
    if (followUpDate && followUpTime) {
      newDueDate = new Date(`${followUpDate}T${followUpTime}`);
    } else {
      newDueDate = new Date(followUpDate);
    }
    if (isNaN(newDueDate.getTime())) {
      newDueDate = new Date();
    }

    // Save previous schedule to rescheduleHistory
    if (!lead.rescheduleHistory) lead.rescheduleHistory = [];
    lead.rescheduleHistory.push({
      previousDueDate: lead.nextFollowUpDate || (lead.followUpDate ? new Date(`${lead.followUpDate}T${lead.followUpTime || '00:00'}`) : null),
      previousDate: lead.followUpDate || '',
      previousTime: lead.followUpTime || '',
      newDueDate: newDueDate,
      newDate: followUpDate,
      newTime: followUpTime || '',
      reason: reason ? reason.trim() : undefined,
      rescheduledBy: req.user.id,
      rescheduledAt: new Date()
    });

    // Update current schedule
    lead.nextFollowUpDate = newDueDate;
    lead.followUpDate = followUpDate;
    lead.followUpTime = followUpTime || '';
    lead.status = 'follow_up';

    // If new note provided with rescheduling
    if (notes && notes.trim()) {
      if (!lead.followUpNotesList) lead.followUpNotesList = [];
      lead.followUpNotesList.push({
        content: notes.trim(),
        createdAt: new Date(),
        createdBy: req.user.id
      });
      lead.followUpNotes = notes.trim();
    }

    await lead.save();

    // Sync open FollowUp document (do NOT create duplicate open follow-up)
    let openFu = await FollowUp.findOne({ relatedType: 'lead', relatedId: lead._id, status: 'open' });
    if (openFu) {
      if (!openFu.rescheduleHistory) openFu.rescheduleHistory = [];
      openFu.rescheduleHistory.push({
        previousDueDate: openFu.dueDate,
        newDueDate: newDueDate,
        reason: reason ? reason.trim() : undefined,
        rescheduledBy: req.user.id,
        rescheduledAt: new Date()
      });
      openFu.dueDate = newDueDate;
      if (notes && notes.trim()) {
        openFu.notes = notes.trim();
        if (!openFu.notesList) openFu.notesList = [];
        openFu.notesList.push({
          content: notes.trim(),
          createdAt: new Date(),
          createdBy: req.user.id
        });
      }
      await openFu.save();
    } else {
      await FollowUp.create({
        relatedType: 'lead',
        relatedId: lead._id,
        dueDate: newDueDate,
        notes: notes || lead.followUpNotes || '',
        status: 'open',
        assignedTo: lead.assignedTo || req.user.id,
        rescheduleHistory: [
          {
            previousDueDate: lead.nextFollowUpDate,
            newDueDate: newDueDate,
            reason: reason ? reason.trim() : undefined,
            rescheduledBy: req.user.id,
            rescheduledAt: new Date()
          }
        ],
        notesList: (notes && notes.trim()) ? [{
          content: notes.trim(),
          createdAt: new Date(),
          createdBy: req.user.id
        }] : []
      });
    }

    // Format readable date and time for audit timeline
    const formattedDateStr = newDueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const formattedTimeStr = followUpTime || newDueDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    await Activity.create({
      relatedType: 'lead',
      relatedId: lead._id,
      type: 'status_change',
      description: `Follow-up rescheduled to ${formattedDateStr} at ${formattedTimeStr}${reason ? ` (Reason: ${reason})` : ''}`,
      createdBy: req.user.id
    });

    const populatedLead = await Lead.findById(lead._id)
      .populate('assignedTo', 'name email avatarUrl role')
      .populate('createdBy', 'name email avatarUrl role')
      .populate('followUpNotesList.createdBy', 'name email avatarUrl role')
      .populate('rescheduleHistory.rescheduledBy', 'name email avatarUrl role');

    return res.json(populatedLead);
  } catch (error) {
    console.error('Error rescheduling follow-up:', error);
    return res.status(500).json({ message: 'Server error rescheduling follow-up' });
  }
};

// POST /api/leads/:id/followup-notes
const addFollowUpNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Note content is required' });
    }

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    if (req.user.role === 'caller' && lead.assignedTo && lead.assignedTo.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: You can only add notes to your assigned leads' });
    }

    if (!lead.followUpNotesList) lead.followUpNotesList = [];
    const newNote = {
      content: content.trim(),
      createdAt: new Date(),
      createdBy: req.user.id
    };
    lead.followUpNotesList.push(newNote);
    lead.followUpNotes = content.trim(); // store latest note for quick display

    await lead.save();

    // Also sync to Activity and FollowUp
    await Activity.create({
      relatedType: 'lead',
      relatedId: lead._id,
      type: 'note',
      description: content.trim(),
      createdBy: req.user.id
    });

    const openFu = await FollowUp.findOne({ relatedType: 'lead', relatedId: lead._id, status: 'open' });
    if (openFu) {
      openFu.notes = content.trim();
      if (!openFu.notesList) openFu.notesList = [];
      openFu.notesList.push(newNote);
      await openFu.save();
    }

    const populatedLead = await Lead.findById(lead._id)
      .populate('assignedTo', 'name email avatarUrl role')
      .populate('createdBy', 'name email avatarUrl role')
      .populate('followUpNotesList.createdBy', 'name email avatarUrl role')
      .populate('rescheduleHistory.rescheduledBy', 'name email avatarUrl role');

    return res.status(201).json(populatedLead);
  } catch (error) {
    console.error('Error adding follow-up note:', error);
    return res.status(500).json({ message: 'Server error adding follow-up note' });
  }
};

// PATCH /api/leads/:id/followup-notes/:noteId
const updateFollowUpNote = async (req, res) => {
  try {
    const { id, noteId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Note content is required' });
    }

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    if (req.user.role === 'caller' && lead.assignedTo && lead.assignedTo.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: You can only edit notes on your assigned leads' });
    }

    const note = lead.followUpNotesList?.id(noteId);
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    note.content = content.trim();
    note.updatedAt = new Date();

    // Update latest note if this was the latest note
    const lastNote = lead.followUpNotesList[lead.followUpNotesList.length - 1];
    if (lastNote && lastNote._id.toString() === noteId) {
      lead.followUpNotes = content.trim();
    }

    await lead.save();

    const populatedLead = await Lead.findById(lead._id)
      .populate('assignedTo', 'name email avatarUrl role')
      .populate('createdBy', 'name email avatarUrl role')
      .populate('followUpNotesList.createdBy', 'name email avatarUrl role')
      .populate('rescheduleHistory.rescheduledBy', 'name email avatarUrl role');

    return res.json(populatedLead);
  } catch (error) {
    console.error('Error updating follow-up note:', error);
    return res.status(500).json({ message: 'Server error updating follow-up note' });
  }
};

// DELETE /api/leads/:id/followup-notes/:noteId
const deleteFollowUpNote = async (req, res) => {
  try {
    const { id, noteId } = req.params;

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    if (req.user.role === 'caller' && lead.assignedTo && lead.assignedTo.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: You can only delete notes on your assigned leads' });
    }

    lead.followUpNotesList = (lead.followUpNotesList || []).filter(n => n._id.toString() !== noteId);
    const lastNote = lead.followUpNotesList.length > 0 ? lead.followUpNotesList[lead.followUpNotesList.length - 1] : null;
    lead.followUpNotes = lastNote ? lastNote.content : '';

    await lead.save();

    const populatedLead = await Lead.findById(lead._id)
      .populate('assignedTo', 'name email avatarUrl role')
      .populate('createdBy', 'name email avatarUrl role')
      .populate('followUpNotesList.createdBy', 'name email avatarUrl role')
      .populate('rescheduleHistory.rescheduledBy', 'name email avatarUrl role');

    return res.json(populatedLead);
  } catch (error) {
    console.error('Error deleting follow-up note:', error);
    return res.status(500).json({ message: 'Server error deleting follow-up note' });
  }
};

// GET /api/leads/lost
const getLostLeads = async (req, res) => {
  try {
    const {
      search,
      reason,
      from,
      to,
      salesExecutive,
      source,
      priority,
      sortBy = 'lostAt_desc',
      page = 1,
      limit = 50
    } = req.query;

    const baseFilter = {
      ...req.scopeFilter,
      status: { $in: ['cancelled', 'order_lost', 'order-lost'] }
    };

    const allScopeLostLeads = await Lead.find(baseFilter)
      .populate('assignedTo', 'name email avatarUrl role phone')
      .populate('createdBy', 'name email avatarUrl role')
      .populate('followUpNotesList.createdBy', 'name email avatarUrl role')
      .populate('rescheduleHistory.rescheduledBy', 'name email avatarUrl role')
      .lean();

    // Summary calculations across scope
    const reasonCounts = {};
    const sourceCounts = {};
    let highPriorityCount = 0;

    allScopeLostLeads.forEach(lead => {
      const r = (lead.cancelReason || '').trim() || 'Unspecified Reason';
      reasonCounts[r] = (reasonCounts[r] || 0) + 1;

      const s = lead.source || 'Direct / Unspecified';
      sourceCounts[s] = (sourceCounts[s] || 0) + 1;

      if (lead.priority === 'high') {
        highPriorityCount++;
      }
    });

    const reasonBreakdown = Object.entries(reasonCounts)
      .map(([reasonText, count]) => ({ reason: reasonText, count }))
      .sort((a, b) => b.count - a.count);

    const sourceBreakdown = Object.entries(sourceCounts)
      .map(([src, count]) => ({ source: src, count }))
      .sort((a, b) => b.count - a.count);

    // Filter matching
    let matchedLeads = allScopeLostLeads;

    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      const cleanPhone = q.replace(/\D/g, '');
      matchedLeads = matchedLeads.filter(lead => {
        const name = (lead.name || '').toLowerCase();
        const company = (lead.company || '').toLowerCase();
        const phone = (lead.phone || '').toLowerCase();
        const email = (lead.email || '').toLowerCase();
        const city = (lead.city || '').toLowerCase();
        const address = (lead.address || '').toLowerCase();
        const rep = (lead.assignedTo?.name || '').toLowerCase();
        const reasonText = (lead.cancelReason || '').toLowerCase();
        const hasMatchingNote = (lead.followUpNotesList || []).some(n =>
          (n.content || '').toLowerCase().includes(q)
        );

        return (
          name.includes(q) ||
          company.includes(q) ||
          phone.includes(q) ||
          (cleanPhone && phone.includes(cleanPhone)) ||
          email.includes(q) ||
          city.includes(q) ||
          address.includes(q) ||
          rep.includes(q) ||
          reasonText.includes(q) ||
          hasMatchingNote
        );
      });
    }

    if (reason && reason !== 'all') {
      const rLower = reason.toLowerCase().trim();
      matchedLeads = matchedLeads.filter(lead =>
        (lead.cancelReason || '').toLowerCase().includes(rLower)
      );
    }

    if (salesExecutive && salesExecutive !== 'all') {
      matchedLeads = matchedLeads.filter(lead => {
        const execId = lead.assignedTo?._id?.toString() || lead.assignedTo?.toString();
        return execId === salesExecutive;
      });
    }

    if (source && source !== 'all') {
      matchedLeads = matchedLeads.filter(lead => lead.source === source);
    }

    if (priority && priority !== 'all') {
      matchedLeads = matchedLeads.filter(lead => lead.priority === priority);
    }

    if (from || to) {
      const fDate = from ? new Date(from) : null;
      const tDate = to ? new Date(to) : null;
      matchedLeads = matchedLeads.filter(lead => {
        const d = lead.updatedAt ? new Date(lead.updatedAt) : new Date(lead.createdAt);
        if (fDate && d < fDate) return false;
        if (tDate && d > tDate) return false;
        return true;
      });
    }

    // Sort
    matchedLeads.sort((a, b) => {
      const getDate = (item) => (item.updatedAt ? new Date(item.updatedAt).getTime() : new Date(item.createdAt).getTime());
      if (sortBy === 'lostAt_asc') return getDate(a) - getDate(b);
      if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'name_desc') return (b.name || '').localeCompare(a.name || '');
      if (sortBy === 'priority_desc') {
        const weight = { high: 3, medium: 2, low: 1 };
        return (weight[b.priority] || 0) - (weight[a.priority] || 0);
      }
      // Default: lostAt_desc
      return getDate(b) - getDate(a);
    });

    const totalFiltered = matchedLeads.length;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;
    const paginatedLeads = matchedLeads.slice(skip, skip + limitNum);

    return res.json({
      leads: paginatedLeads,
      total: totalFiltered,
      page: pageNum,
      totalPages: Math.ceil(totalFiltered / limitNum) || 1,
      summary: {
        totalLostLeads: allScopeLostLeads.length,
        highPriorityCount,
        topReason: reasonBreakdown[0]?.reason || 'None',
        topSource: sourceBreakdown[0]?.source || 'None',
        reasonBreakdown,
        sourceBreakdown,
        filteredCount: totalFiltered
      }
    });
  } catch (error) {
    console.error('Error fetching lost leads:', error);
    return res.status(500).json({ message: 'Server error fetching lost leads' });
  }
};

// GET /api/leads/lost/export-excel
const exportLostLeadsExcel = async (req, res) => {
  try {
    const { search, reason, from, to, salesExecutive, source, priority } = req.query;

    const leads = await Lead.find({
      ...req.scopeFilter,
      status: { $in: ['cancelled', 'order_lost', 'order-lost'] }
    })
      .populate('assignedTo', 'name email phone')
      .populate('createdBy', 'name email')
      .sort({ updatedAt: -1 })
      .lean();

    let filtered = leads;
    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      filtered = filtered.filter(l =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.company || '').toLowerCase().includes(q) ||
        (l.phone || '').toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.cancelReason || '').toLowerCase().includes(q)
      );
    }
    if (reason && reason !== 'all') {
      filtered = filtered.filter(l => (l.cancelReason || '').toLowerCase().includes(reason.toLowerCase().trim()));
    }
    if (salesExecutive && salesExecutive !== 'all') {
      filtered = filtered.filter(l => (l.assignedTo?._id?.toString() || l.assignedTo?.toString()) === salesExecutive);
    }
    if (source && source !== 'all') {
      filtered = filtered.filter(l => l.source === source);
    }
    if (priority && priority !== 'all') {
      filtered = filtered.filter(l => l.priority === priority);
    }
    if (from || to) {
      const fDate = from ? new Date(from) : null;
      const tDate = to ? new Date(to) : null;
      filtered = filtered.filter(l => {
        const d = l.updatedAt ? new Date(l.updatedAt) : new Date(l.createdAt);
        if (fDate && d < fDate) return false;
        if (tDate && d > tDate) return false;
        return true;
      });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'JS Labels CRM';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Lost Leads Register', {
      views: [{ showGridLines: true }]
    });

    // Title banner
    sheet.mergeCells('A1:L1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'JS LABELS - LOST LEADS AUDIT REGISTER';
    titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE11D48' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 36;

    // Subtitle
    sheet.mergeCells('A2:L2');
    const subCell = sheet.getCell('A2');
    subCell.value = `Generated: ${new Date().toLocaleString('en-IN')} | Total Records: ${filtered.length} | Exported By: ${req.user.name || 'System'}`;
    subCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF475569' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    sheet.getRow(2).height = 20;

    sheet.addRow([]);

    const headers = [
      'S.No',
      'Lead Name',
      'Company Name',
      'Phone Number',
      'Email Address',
      'Source',
      'Priority',
      'City',
      'Assigned Sales Rep',
      'Created Date',
      'Marked as Lost (Date & Time)',
      'Reason for Loss / Cancellation'
    ];

    const headerRow = sheet.addRow(headers);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });

    filtered.forEach((lead, idx) => {
      const lostDateObj = lead.updatedAt ? new Date(lead.updatedAt) : new Date(lead.createdAt);
      const lostDateFormatted = lostDateObj.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }) + ', ' + lostDateObj.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      const createdDateFormatted = lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }) : '—';

      const row = sheet.addRow([
        idx + 1,
        lead.name || '—',
        lead.company || '—',
        lead.phone || '—',
        lead.email || '—',
        lead.source || '—',
        (lead.priority || 'medium').toUpperCase(),
        lead.city || '—',
        lead.assignedTo?.name || 'Unassigned',
        createdDateFormatted,
        lostDateFormatted,
        (lead.cancelReason || 'Unspecified').trim()
      ]);

      row.height = 22;
      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 9 };
        cell.alignment = { vertical: 'middle', horizontal: [1, 7].includes(colNumber) ? 'center' : 'left' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
      });
    });

    sheet.columns = [
      { width: 6 },   // S.No
      { width: 22 },  // Lead Name
      { width: 24 },  // Company
      { width: 16 },  // Phone
      { width: 24 },  // Email
      { width: 16 },  // Source
      { width: 12 },  // Priority
      { width: 16 },  // City
      { width: 22 },  // Assigned Rep
      { width: 14 },  // Created Date
      { width: 26 },  // Marked Lost Date & Time
      { width: 35 }   // Reason
    ];

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="JS_Labels_Lost_Leads_${new Date().toISOString().split('T')[0]}.xlsx"`
    );

    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error('Error exporting lost leads Excel:', error);
    return res.status(500).json({ message: 'Server error exporting lost leads Excel' });
  }
};

// POST /api/leads/:id/reopen
const reopenLostLead = async (req, res) => {
  try {
    const { id } = req.params;
    const { newStatus = 'contacted', notes, nextFollowUpDate } = req.body;

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const validNewStatuses = ['new', 'contacted', 'follow_up'];
    if (!validNewStatuses.includes(newStatus)) {
      return res.status(400).json({ message: 'Invalid restore stage for lead' });
    }

    const previousReason = lead.cancelReason;
    lead.status = newStatus;
    lead.cancelReason = undefined;

    if (nextFollowUpDate) {
      lead.nextFollowUpDate = new Date(nextFollowUpDate);
    }

    const remarkText = notes && notes.trim()
      ? `Lead Reopened from Order-Lost: ${notes.trim()}`
      : `Lead Reopened from Order-Lost (Previous reason: ${previousReason || 'N/A'})`;

    lead.followUpNotesList.push({
      content: remarkText,
      createdBy: req.user.id,
      createdAt: new Date()
    });

    await lead.save();

    await Activity.create({
      relatedType: 'lead',
      relatedId: lead._id,
      action: 'status_change',
      description: `Reopened lost lead to '${newStatus}'. ${notes ? `Remarks: ${notes}` : ''}`,
      createdBy: req.user.id
    });

    const populatedLead = await Lead.findById(lead._id)
      .populate('assignedTo', 'name email avatarUrl role')
      .populate('createdBy', 'name email avatarUrl role');

    return res.json({
      message: 'Lead reopened successfully and restored to active pipeline',
      lead: populatedLead
    });
  } catch (error) {
    console.error('Error reopening lost lead:', error);
    return res.status(500).json({ message: 'Server error reopening lost lead' });
  }
};

module.exports = {
  getLeads,
  getLostLeads,
  exportLostLeadsExcel,
  reopenLostLead,
  getLeadById,
  createLead,
  updateLead,
  updateLeadStatus,
  reassignLead,
  addLeadActivity,
  deleteLead,
  rescheduleFollowUp,
  addFollowUpNote,
  updateFollowUpNote,
  deleteFollowUpNote
};
