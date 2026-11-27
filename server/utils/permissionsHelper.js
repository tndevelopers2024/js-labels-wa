const Settings = require('../models/Settings');
const defaultPermissions = require('../config/permissions');

const MODULE_KEYS = [
  'dashboard',
  'leads',
  'customers',
  'orders',
  'products',
  'production',
  'followups',
  'reminders',
  'reports',
  'users',
  'settings'
];

/**
 * Returns the effective permissions for all roles, merged from Settings or fallback to defaults.
 */
async function getRolePermissions() {
  try {
    const settings = await Settings.findOne({ singleton: true });
    if (settings && settings.rolePermissions && typeof settings.rolePermissions === 'object') {
      const merged = JSON.parse(JSON.stringify(defaultPermissions));

      for (const role of ['manager', 'caller']) {
        if (settings.rolePermissions[role] && typeof settings.rolePermissions[role] === 'object') {
          for (const mod of MODULE_KEYS) {
            if (settings.rolePermissions[role][mod] !== undefined) {
              merged[role][mod] = Array.isArray(settings.rolePermissions[role][mod])
                ? settings.rolePermissions[role][mod]
                : [];
            }
          }
        }
      }

      // Safety: super_admin always keeps full access to all modules
      merged.super_admin = JSON.parse(JSON.stringify(defaultPermissions.super_admin));
      return merged;
    }
  } catch (err) {
    console.error('Error loading role permissions from Settings:', err.message);
  }

  return JSON.parse(JSON.stringify(defaultPermissions));
}

/**
 * Returns permissions for a specific role.
 */
async function getPermissionsForRole(role) {
  if (role === 'super_admin') {
    return JSON.parse(JSON.stringify(defaultPermissions.super_admin));
  }
  const all = await getRolePermissions();
  return all[role] || defaultPermissions[role] || {};
}

/**
 * Clean & sanitize user-submitted role permissions before saving.
 */
function sanitizeRolePermissions(inputPermissions, currentMerged = defaultPermissions) {
  if (!inputPermissions || typeof inputPermissions !== 'object') {
    return null;
  }

  const sanitized = {
    manager: {},
    caller: {}
  };

  for (const role of ['manager', 'caller']) {
    const roleInput = inputPermissions[role] || {};
    const fallbackRole = currentMerged[role] || defaultPermissions[role] || {};

    for (const mod of MODULE_KEYS) {
      if (roleInput[mod] !== undefined) {
        if (Array.isArray(roleInput[mod])) {
          sanitized[role][mod] = roleInput[mod];
        } else if (roleInput[mod] === true) {
          // If a boolean toggle was passed: grant previous actions or default to view/create/edit
          const prevActions = fallbackRole[mod] || [];
          sanitized[role][mod] = prevActions.length > 0 ? prevActions : ['view'];
        } else {
          // False or null: revoke all
          sanitized[role][mod] = [];
        }
      } else {
        sanitized[role][mod] = fallbackRole[mod] || [];
      }
    }
  }

  return sanitized;
}

module.exports = {
  MODULE_KEYS,
  getRolePermissions,
  getPermissionsForRole,
  sanitizeRolePermissions
};
