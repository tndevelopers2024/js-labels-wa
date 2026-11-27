const Settings = require('../models/Settings');
const { getRolePermissions, sanitizeRolePermissions } = require('../utils/permissionsHelper');

// GET /api/settings
const getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne({ singleton: true });
    if (!settings) {
      settings = await Settings.create({
        reminderLeadDays: [7, 3, 0],
        singleton: true
      });
    }

    const effectiveRolePermissions = await getRolePermissions();
    const settingsObj = settings.toObject ? settings.toObject() : { ...settings };
    settingsObj.rolePermissions = effectiveRolePermissions;

    return res.json(settingsObj);
  } catch (error) {
    console.error('Error fetching settings:', error);
    return res.status(500).json({ message: 'Server error fetching settings' });
  }
};

// PATCH /api/settings
const updateSettings = async (req, res) => {
  try {
    const { reminderLeadDays, notificationTemplates, autoAssignmentRule, rolePermissions } = req.body;

    let settings = await Settings.findOne({ singleton: true });
    if (!settings) {
      settings = new Settings({ singleton: true });
    }

    if (reminderLeadDays && Array.isArray(reminderLeadDays)) {
      settings.reminderLeadDays = reminderLeadDays.map(d => parseInt(d)).filter(d => !isNaN(d));
    }

    if (notificationTemplates) {
      settings.notificationTemplates = {
        ...settings.notificationTemplates,
        ...notificationTemplates
      };
    }

    if (autoAssignmentRule && ['round_robin', 'load_based'].includes(autoAssignmentRule)) {
      settings.autoAssignmentRule = autoAssignmentRule;
    }

    if (rolePermissions && typeof rolePermissions === 'object') {
      const currentRolePerms = await getRolePermissions();
      const sanitized = sanitizeRolePermissions(rolePermissions, currentRolePerms);
      if (sanitized) {
        settings.rolePermissions = sanitized;
        settings.markModified('rolePermissions');
      }
    }

    await settings.save();

    const effectiveRolePermissions = await getRolePermissions();
    const settingsObj = settings.toObject ? settings.toObject() : { ...settings };
    settingsObj.rolePermissions = effectiveRolePermissions;

    return res.json(settingsObj);
  } catch (error) {
    console.error('Error updating settings:', error);
    return res.status(500).json({ message: 'Server error updating settings' });
  }
};

module.exports = {
  getSettings,
  updateSettings
};
