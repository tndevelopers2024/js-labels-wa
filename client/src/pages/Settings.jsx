import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import {
  Settings as SettingsIcon,
  Save,
  Clock,
  Bell,
  UserCheck,
  FileText,
  ShieldCheck,
  Shield,
  Lock,
  Check,
  Copy,
  LayoutDashboard,
  UserPlus,
  Building2,
  ShoppingBag,
  Ruler,
  Factory,
  Calendar,
  BarChart3,
  Users,
  CheckCircle2,
  XCircle,
  Sliders,
  RotateCcw,
  Sparkles,
  Info
} from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';

const MODULES = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, desc: 'Sales KPI metrics, live orders count & revenue summaries' },
  { key: 'leads', label: 'Leads & Lost Leads', icon: UserPlus, desc: 'Lead qualification, telecaller follow-up & lost leads archive' },
  { key: 'customers', label: 'Customers', icon: Building2, desc: 'Customer accounts, purchase history & label usage profiles' },
  { key: 'orders', label: 'Orders', icon: ShoppingBag, desc: 'Confirmed orders ledger, month filters & multi-sheet Excel export' },
  { key: 'products', label: 'Products', icon: Ruler, desc: 'Dimension catalog, label specifications & pricing specifications' },
  { key: 'production', label: 'Production Planning', icon: Factory, desc: 'Machine die setups, batching efficiency & monthly demand forecasts' },
  { key: 'followups', label: 'Follow-ups', icon: Calendar, desc: 'Scheduled client communications, call reminders & activity logs' },
  { key: 'reminders', label: 'Reorder Reminders', icon: Bell, desc: 'Algorithmic repeat reorder alerts & notification triggers' },
  { key: 'reports', label: 'Reports & Analytics', icon: BarChart3, desc: 'Month-wise revenue performance & customer/product dossiers' },
  { key: 'users', label: 'User Management', icon: Users, desc: 'Team member accounts, role assignments & system credentials' },
  { key: 'settings', label: 'System Settings', icon: SettingsIcon, desc: 'Global automation milestones, notification templates & role access' }
];

const ROLE_INFO = {
  super_admin: {
    label: 'Super Admin',
    desc: 'Unrestricted system owner with full administrative, financial and security access.',
    badgeClass: 'bg-red-100 text-red-800 border-red-200'
  },
  manager: {
    label: 'Manager',
    desc: 'Operations & sales supervisor overseeing orders, production, customers and reports.',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200'
  },
  caller: {
    label: 'Caller / Sales Executive',
    desc: 'Frontline telecalling staff handling daily lead outreach, customer orders and follow-ups.',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200'
  }
};

function SettingsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-10 w-44 rounded-xl" />
          <Skeleton className="h-10 w-44 rounded-xl" />
          <Skeleton className="h-10 w-44 rounded-xl" />
        </div>
      </div>
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </div>
  );
}

export default function Settings() {
  const { user, checkAuth } = useAuth();
  const notify = useNotification();
  const confirm = useConfirm();

  const [activeTab, setActiveTab] = useState('permissions'); // 'permissions' | 'automation' | 'templates'
  const [activeRoleTab, setActiveRoleTab] = useState('manager'); // 'manager' | 'caller'

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Automation & Milestones State
  const [leadDaysStr, setLeadDaysStr] = useState('7, 3, 0');
  const [autoAssignmentRule, setAutoAssignmentRule] = useState('round_robin');

  // Notification Templates State
  const [templates, setTemplates] = useState({
    reorderWhatsapp: '',
    reorderEmail: ''
  });

  // Role Permissions State
  const [rolePermissions, setRolePermissions] = useState({
    super_admin: {},
    manager: {},
    caller: {}
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const res = await api.get('/settings');
        const data = res.data;

        if (data.reminderLeadDays) {
          setLeadDaysStr(data.reminderLeadDays.join(', '));
        }
        if (data.notificationTemplates) {
          setTemplates({
            reorderWhatsapp: data.notificationTemplates.reorderWhatsapp || '',
            reorderEmail: data.notificationTemplates.reorderEmail || ''
          });
        }
        if (data.autoAssignmentRule) {
          setAutoAssignmentRule(data.autoAssignmentRule);
        }
        if (data.rolePermissions) {
          setRolePermissions(data.rolePermissions);
        }
      } catch (err) {
        console.error('Error fetching settings:', err);
        notify.error(err.response?.data?.message || 'Error fetching system settings');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  // Check if a role has view access to a module
  const hasModuleAccess = (roleKey, moduleKey) => {
    if (roleKey === 'super_admin') return true;
    const actions = rolePermissions[roleKey]?.[moduleKey];
    return Array.isArray(actions) && actions.includes('view');
  };

  // Toggle access for a module on a role
  const handleToggleModuleAccess = (roleKey, moduleKey) => {
    if (roleKey === 'super_admin') return; // Protected

    setRolePermissions(prev => {
      const currentRole = prev[roleKey] || {};
      const currentActions = currentRole[moduleKey] || [];
      const isAllowed = currentActions.includes('view');

      let nextActions = [];
      if (!isAllowed) {
        // Grant permissions appropriate for the role
        if (roleKey === 'manager') {
          nextActions = ['view', 'create', 'edit', 'delete'];
        } else {
          // Caller
          if (['reports', 'production', 'products', 'settings', 'users'].includes(moduleKey)) {
            nextActions = ['view'];
          } else {
            nextActions = ['view', 'create', 'edit'];
          }
        }
      }

      return {
        ...prev,
        [roleKey]: {
          ...currentRole,
          [moduleKey]: nextActions
        }
      };
    });
  };

  // Quick Action: Grant All Pages to a role
  const handleGrantAll = (roleKey) => {
    if (roleKey === 'super_admin') return;

    setRolePermissions(prev => {
      const updated = { ...(prev[roleKey] || {}) };
      MODULES.forEach(m => {
        if (roleKey === 'manager') {
          updated[m.key] = ['view', 'create', 'edit', 'delete'];
        } else {
          updated[m.key] = ['reports', 'production', 'products', 'settings', 'users'].includes(m.key)
            ? ['view']
            : ['view', 'create', 'edit'];
        }
      });
      return { ...prev, [roleKey]: updated };
    });
    notify.info(`All pages enabled for ${ROLE_INFO[roleKey]?.label || roleKey}`);
  };

  // Quick Action: Restrict All Pages for a role
  const handleRestrictAll = (roleKey) => {
    if (roleKey === 'super_admin') return;

    setRolePermissions(prev => {
      const updated = {};
      MODULES.forEach(m => {
        updated[m.key] = [];
      });
      return { ...prev, [roleKey]: updated };
    });
    notify.warning(`All pages restricted for ${ROLE_INFO[roleKey]?.label || roleKey}`);
  };

  // Quick Action: Reset a role's permissions to system defaults
  const handleResetDefaults = (roleKey) => {
    if (roleKey === 'super_admin') return;

    setRolePermissions(prev => {
      const defaultManager = {
        dashboard: ['view', 'create', 'edit', 'delete'],
        leads: ['view', 'create', 'edit', 'delete'],
        customers: ['view', 'create', 'edit', 'delete'],
        orders: ['view', 'create', 'edit', 'delete'],
        products: ['view'],
        production: ['view', 'create', 'edit', 'delete'],
        followups: ['view', 'create', 'edit', 'delete'],
        reminders: ['view', 'create', 'edit', 'delete'],
        reports: ['view', 'create', 'edit', 'delete'],
        users: [],
        settings: []
      };

      const defaultCaller = {
        dashboard: ['view'],
        leads: ['view', 'create', 'edit'],
        customers: ['view', 'create', 'edit'],
        orders: ['view', 'create', 'edit'],
        products: ['view'],
        production: ['view'],
        followups: ['view', 'create', 'edit'],
        reminders: ['view'],
        reports: [],
        users: [],
        settings: []
      };

      return {
        ...prev,
        [roleKey]: roleKey === 'manager' ? defaultManager : defaultCaller
      };
    });
    notify.info(`Reset permissions to default preset for ${ROLE_INFO[roleKey]?.label || roleKey}`);
  };

  // Submit Settings Form
  const handleSaveAll = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    const isConfirmed = await confirm({
      title: 'Save System Settings & Access Controls',
      message: 'This will save role page permissions, automation lead days, and notification templates. Permissions take effect immediately for active users.',
      confirmLabel: 'Save Changes',
      cancelLabel: 'Cancel',
      variant: 'default'
    });

    if (!isConfirmed) return;

    try {
      setIsSaving(true);

      const parsedLeadDays = leadDaysStr
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n));

      const payload = {
        reminderLeadDays: parsedLeadDays,
        notificationTemplates: templates,
        autoAssignmentRule,
        rolePermissions
      };

      const res = await api.patch('/settings', payload);

      if (res.data?.rolePermissions) {
        setRolePermissions(res.data.rolePermissions);
      }
      if (res.data?.reminderLeadDays) {
        setLeadDaysStr(res.data.reminderLeadDays.join(', '));
      }

      // Re-sync current session authentication permissions
      if (checkAuth) {
        await checkAuth();
      }

      notify.success('Settings and role page access saved successfully!');
    } catch (err) {
      console.error('Failed to save settings:', err);
      notify.error(err.response?.data?.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const copyVariable = (varName) => {
    navigator.clipboard.writeText(`{{${varName}}}`);
    notify.success(`Copied placeholder {{${varName}}} to clipboard`);
  };

  // Count active modules for each role
  const managerAllowedCount = MODULES.filter(m => hasModuleAccess('manager', m.key)).length;
  const callerAllowedCount = MODULES.filter(m => hasModuleAccess('caller', m.key)).length;

  return (
    <div className="space-y-6 pb-12 font-sans max-w-7xl mx-auto">
      
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">System Settings</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">
              Super Admin
            </span>
          </div>
          <p className="text-slate-500 text-xs sm:text-sm mt-1 font-normal">
            Manage role-based page access, reorder lead automation, and notification templates
          </p>
        </div>

        <button
          type="button"
          onClick={handleSaveAll}
          disabled={isSaving || loading}
          className="px-4 py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-xl text-xs font-semibold shadow-2xs transition disabled:opacity-50 flex items-center gap-2 shrink-0 cursor-pointer"
        >
          <Save size={15} />
          <span>{isSaving ? 'Saving Changes...' : 'Save Settings'}</span>
        </button>
      </div>

      {loading ? (
        <SettingsSkeleton />
      ) : (
        <div className="space-y-6">

          {/* Navigation Tabs Bar */}
          <div className="bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('permissions')}
              className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'permissions'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <ShieldCheck size={16} className={activeTab === 'permissions' ? 'text-red-400' : 'text-slate-400'} />
              <span>Role Page Access</span>
              <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === 'permissions' ? 'bg-slate-800 text-red-300' : 'bg-slate-100 text-slate-600'
              }`}>
                Active Controls
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('automation')}
              className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'automation'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Clock size={16} className={activeTab === 'automation' ? 'text-red-400' : 'text-slate-400'} />
              <span>Automation & Milestones</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('templates')}
              className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'templates'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <FileText size={16} className={activeTab === 'templates' ? 'text-red-400' : 'text-slate-400'} />
              <span>Notification Templates</span>
            </button>
          </div>

          {/* TAB 1: ROLE PAGE ACCESS CONTROLS */}
          {activeTab === 'permissions' && (
            <div className="space-y-6">

              {/* Informational Callout */}
              <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-5 border border-slate-700/80 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-red-600/30 border border-red-500/40 text-red-400 flex items-center justify-center shrink-0">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-white">Dynamic Role-Based Access Control</h3>
                    <p className="text-slate-300 text-xs mt-0.5 leading-relaxed font-normal">
                      Toggle which pages Managers and Callers can view in the CRM. Unchecked pages will be hidden from the navigation sidebar and blocked by route security.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="px-3 py-1.5 bg-slate-800/80 rounded-xl border border-slate-700 text-[11px] text-slate-300 flex items-center gap-2">
                    <Lock size={13} className="text-red-400" />
                    <span>Super Admin: <strong>All Pages (Locked)</strong></span>
                  </div>
                </div>
              </div>

              {/* Role Selector Tabs */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select Role to Manage:</span>
                    <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200/80">
                      <button
                        type="button"
                        onClick={() => setActiveRoleTab('manager')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                          activeRoleTab === 'manager'
                            ? 'bg-white text-blue-700 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        <span>Manager</span>
                        <span className="px-1.5 py-0.2 rounded-md bg-blue-50 text-[10px] font-extrabold text-blue-700 border border-blue-200">
                          {managerAllowedCount} / {MODULES.length}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveRoleTab('caller')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                          activeRoleTab === 'caller'
                            ? 'bg-white text-emerald-700 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span>Caller (Sales Executive)</span>
                        <span className="px-1.5 py-0.2 rounded-md bg-emerald-50 text-[10px] font-extrabold text-emerald-700 border border-emerald-200">
                          {callerAllowedCount} / {MODULES.length}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Quick Action Buttons for the active role */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleGrantAll(activeRoleTab)}
                      className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-1"
                      title="Grant access to all pages for this role"
                    >
                      <CheckCircle2 size={13} className="text-emerald-600" />
                      <span>Allow All</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRestrictAll(activeRoleTab)}
                      className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-1"
                      title="Restrict all pages for this role"
                    >
                      <XCircle size={13} className="text-rose-600" />
                      <span>Restrict All</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleResetDefaults(activeRoleTab)}
                      className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-1"
                      title="Reset role permissions to recommended presets"
                    >
                      <RotateCcw size={13} className="text-slate-500" />
                      <span>Reset Preset</span>
                    </button>
                  </div>
                </div>

                {/* Role Description Banner */}
                <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/60 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className={`px-2.5 py-1 rounded-lg font-bold border text-xs ${ROLE_INFO[activeRoleTab].badgeClass}`}>
                      {ROLE_INFO[activeRoleTab].label}
                    </span>
                    <span className="text-slate-600 font-medium">{ROLE_INFO[activeRoleTab].desc}</span>
                  </div>
                  <div className="text-slate-500 text-[11px] font-semibold shrink-0">
                    {activeRoleTab === 'manager' ? managerAllowedCount : callerAllowedCount} of {MODULES.length} Pages Accessible
                  </div>
                </div>

                {/* Modules Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {MODULES.map((mod) => {
                    const IconComponent = mod.icon;
                    const isAllowed = hasModuleAccess(activeRoleTab, mod.key);

                    return (
                      <div
                        key={mod.key}
                        onClick={() => handleToggleModuleAccess(activeRoleTab, mod.key)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer select-none flex items-center justify-between gap-3 ${
                          isAllowed
                            ? 'bg-white border-slate-300/90 shadow-2xs hover:border-slate-400'
                            : 'bg-slate-50/60 border-slate-200/70 hover:bg-slate-50 opacity-80'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition ${
                            isAllowed
                              ? 'bg-slate-900 text-white shadow-2xs'
                              : 'bg-slate-200 text-slate-400'
                          }`}>
                            <IconComponent size={18} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-xs tracking-tight truncate">
                                {mod.label}
                              </span>
                              <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                                isAllowed
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-500 border border-slate-200'
                              }`}>
                                {isAllowed ? 'Allowed' : 'Hidden'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 font-normal truncate mt-0.5">
                              {mod.desc}
                            </p>
                          </div>
                        </div>

                        {/* Custom Toggle Switch */}
                        <div
                          className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 shrink-0 ${
                            isAllowed ? 'bg-red-600' : 'bg-slate-300'
                          }`}
                        >
                          <div
                            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                              isAllowed ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Super Admin Protected Status Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2.5 py-1 rounded-lg font-bold border text-xs bg-red-100 text-red-800 border-red-200">
                      Super Admin Role
                    </span>
                    <span className="text-xs text-slate-500 font-medium">System owner role — permissions are permanently locked for security.</span>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1">
                    <Check size={13} />
                    <span>All {MODULES.length} Pages Active</span>
                  </span>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: AUTOMATION & MILESTONES */}
          {activeTab === 'automation' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Reorder Reminder Milestones Card */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs space-y-5">
                <div className="border-b border-slate-100 pb-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <Bell size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Reorder Reminder Lead Milestones</h3>
                    <p className="text-xs text-slate-500 font-normal mt-0.5">Automated schedule for triggering client repeat order reminders</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Milestone Days (Comma Separated)
                    </label>
                    <input
                      type="text"
                      required
                      value={leadDaysStr}
                      onChange={(e) => setLeadDaysStr(e.target.value)}
                      placeholder="7, 3, 0"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>

                  {/* Preset Quick Chips */}
                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">Quick Presets:</span>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'Standard (7, 3, 0)', val: '7, 3, 0' },
                        { label: 'Extended (14, 7, 3, 0)', val: '14, 7, 3, 0' },
                        { label: 'Fast (3, 1, 0)', val: '3, 1, 0' },
                        { label: 'Single Alert (7)', val: '7' }
                      ].map(preset => (
                        <button
                          key={preset.val}
                          type="button"
                          onClick={() => setLeadDaysStr(preset.val)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Visual Timeline Preview */}
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">Trigger Schedule:</span>
                    <p className="text-slate-600 leading-relaxed font-normal">
                      Reminders dispatch at{' '}
                      <strong>
                        {leadDaysStr
                          .split(',')
                          .map(s => s.trim())
                          .filter(Boolean)
                          .map(d => (d === '0' ? 'on the due date' : `${d} days prior`))
                          .join(', ')}
                      </strong>{' '}
                      to the customer's predicted repeat reorder date.
                    </p>
                  </div>
                </div>
              </div>

              {/* Lead Auto-Assignment Routing Strategy Card */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs space-y-5">
                <div className="border-b border-slate-100 pb-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <UserCheck size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Lead Auto-Assignment Strategy</h3>
                    <p className="text-xs text-slate-500 font-normal mt-0.5">Algorithm used to distribute inbound website & telecalling leads</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Option 1: Round Robin */}
                  <div
                    onClick={() => setAutoAssignmentRule('round_robin')}
                    className={`p-4 rounded-xl border transition cursor-pointer flex items-start gap-3.5 ${
                      autoAssignmentRule === 'round_robin'
                        ? 'bg-blue-50/50 border-blue-400 ring-1 ring-blue-400 shadow-2xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="autoAssignmentRule"
                      checked={autoAssignmentRule === 'round_robin'}
                      onChange={() => setAutoAssignmentRule('round_robin')}
                      className="mt-1 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">Round Robin (Recommended)</h4>
                      <p className="text-[11px] text-slate-500 font-normal mt-0.5 leading-relaxed">
                        Distributes incoming leads sequentially one-by-one across all active callers to ensure equal opportunity.
                      </p>
                    </div>
                  </div>

                  {/* Option 2: Load Based */}
                  <div
                    onClick={() => setAutoAssignmentRule('load_based')}
                    className={`p-4 rounded-xl border transition cursor-pointer flex items-start gap-3.5 ${
                      autoAssignmentRule === 'load_based'
                        ? 'bg-blue-50/50 border-blue-400 ring-1 ring-blue-400 shadow-2xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="autoAssignmentRule"
                      checked={autoAssignmentRule === 'load_based'}
                      onChange={() => setAutoAssignmentRule('load_based')}
                      className="mt-1 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">Load Based Distribution</h4>
                      <p className="text-[11px] text-slate-500 font-normal mt-0.5 leading-relaxed">
                        Assigns each new lead to the active caller who currently has the fewest open / in-progress leads.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: NOTIFICATION TEMPLATES */}
          {activeTab === 'templates' && (
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs space-y-6">
              <div className="border-b border-slate-100 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                    <FileText size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Customer Reorder Notification Templates</h3>
                    <p className="text-xs text-slate-500 font-normal mt-0.5">Configure automated reminder message copies for WhatsApp & Email</p>
                  </div>
                </div>

                {/* Variable Pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-400 font-semibold mr-1">Insert Variable:</span>
                  {['customerName', 'company', 'expectedReorderDate', 'probability'].map((varName) => (
                    <button
                      key={varName}
                      type="button"
                      onClick={() => copyVariable(varName)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] rounded-lg transition cursor-pointer flex items-center gap-1"
                      title={`Click to copy {{${varName}}}`}
                    >
                      <span>&#123;&#123;{varName}&#125;&#125;</span>
                      <Copy size={11} className="text-slate-400" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* WhatsApp Template */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-800">
                      WhatsApp Reminder Template
                    </label>
                    <span className="text-[11px] text-slate-400">
                      {templates.reorderWhatsapp?.length || 0} characters
                    </span>
                  </div>
                  <textarea
                    rows="4"
                    value={templates.reorderWhatsapp}
                    onChange={(e) => setTemplates({ ...templates, reorderWhatsapp: e.target.value })}
                    placeholder="Enter WhatsApp reminder message template..."
                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 font-mono font-medium focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Dispatched automatically via WhatsApp API when reminder criteria are met.
                  </p>
                </div>

                {/* Email Template */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-800">
                      Email Reminder Template
                    </label>
                    <span className="text-[11px] text-slate-400">
                      {templates.reorderEmail?.length || 0} characters
                    </span>
                  </div>
                  <textarea
                    rows="4"
                    value={templates.reorderEmail}
                    onChange={(e) => setTemplates({ ...templates, reorderEmail: e.target.value })}
                    placeholder="Enter Email reminder message template..."
                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 font-mono font-medium focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Sent to client contact email addresses with dynamic date formatting.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Save Action Footer */}
          <div className="flex items-center justify-between bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs">
            <span className="text-xs text-slate-500 font-medium">
              Changes saved here apply immediately across the CRM and update sidebar navigation.
            </span>

            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold text-xs rounded-xl shadow-2xs transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              <Save size={15} />
              <span>{isSaving ? 'Saving Configurations...' : 'Save Settings'}</span>
            </button>
          </div>

        </div>
      )}

    </div>
  );
}
