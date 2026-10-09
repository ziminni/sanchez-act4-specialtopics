import React from "react";
import {
  Activity,
  BadgeCheck,
  BookOpen,
  ChartNoAxesCombined,
  ClipboardCheck,
  CreditCard,
  Database,
  FileText,
  HandCoins,
  LayoutDashboard,
  LogOut,
  MapPin,
  PauseCircle,
  PlugZap,
  RotateCcw,
  Settings,
  ShieldCheck,
  TrendingUp,
  Truck,
  UserCog,
  Users,
  Wifi,
} from "lucide-react";
import { api, setSessionToken } from "../api/client";
import { useApp } from "../app/AppContext";

export function Sidebar() {
  const {
    user,
    setUser,
    page,
    setData,
    branding,
    systemAdmin,
    collectionSupervisor,
    auditor,
    technician,
    can,
    run,
    navigate,
  } = useApp();
  if (!user) return null;
  const nav: [string, any, string, string][] = technician
    ? [
        ["Dashboard", LayoutDashboard, "service.view", "OVERVIEW"],
        ["Service Accounts", Wifi, "service.view", "SERVICE OPERATIONS"],
        ["Suspensions", PauseCircle, "service.view", "SERVICE OPERATIONS"],
        ["Reconnections", PlugZap, "service.view", "SERVICE OPERATIONS"],
      ]
    : collectionSupervisor
      ? [
          ["Dashboard", LayoutDashboard, "collection.view", "OVERVIEW"],
          ["Areas & Routes", MapPin, "collection.view", "COLLECTIONS"],
          ["Batches", Truck, "collection.view", "COLLECTIONS"],
          [
            "Remittance & Reconciliation",
            ClipboardCheck,
            "collection.view",
            "COLLECTIONS",
          ],
          [
            "Collector Performance",
            TrendingUp,
            "collection.view",
            "COLLECTIONS",
          ],
          ["Ledger", BookOpen, "ledger.view", "ACCOUNTS & REPORTS"],
        ]
      : auditor
        ? [
            ["Dashboard", LayoutDashboard, "audit.view", "OVERVIEW"],
            ["Adjustments & Reversals", RotateCcw, "audit.view", "AUDIT"],
            ["Audit Trail", Activity, "audit.view", "AUDIT"],
            ["Receivables", HandCoins, "report.view", "ACCOUNTS & REPORTS"],
            [
              "Reports",
              ChartNoAxesCombined,
              "report.view",
              "ACCOUNTS & REPORTS",
            ],
          ]
        : systemAdmin
          ? [
              ["Dashboard", LayoutDashboard, "system.view", "OVERVIEW"],
              ["User Management", UserCog, "user.manage", "ACCESS & SECURITY"],
              [
                "Security Audit",
                ShieldCheck,
                "security.view",
                "ACCESS & SECURITY",
              ],
              ["Backup Restore", Database, "backup.restore", "SYSTEM"],
              ["System Settings", Settings, "system.settings", "SYSTEM"],
            ]
          : [
              ["Dashboard", LayoutDashboard, "report.view", "OVERVIEW"],
              ["Subscribers", Users, "subscriber.view", "CUSTOMERS"],
              ["Services", Wifi, "service.view", "CUSTOMERS"],
              ["Billing", FileText, "subscriber.view", "BILLING & PAYMENTS"],
              ["Payments", CreditCard, "subscriber.view", "BILLING & PAYMENTS"],
              [
                "GCash Verification",
                BadgeCheck,
                "payment.verify",
                "BILLING & PAYMENTS",
              ],
              ["Collections", Truck, "collection.view", "COLLECTIONS"],
              ["Areas & Routes", MapPin, "collection.view", "COLLECTIONS"],
              [
                "Remittance & Reconciliation",
                ClipboardCheck,
                "collection.view",
                "COLLECTIONS",
              ],
              [
                "Collector Performance",
                TrendingUp,
                "collection.view",
                "COLLECTIONS",
              ],
              ["Receivables", HandCoins, "report.view", "ACCOUNTS & REPORTS"],
              ["Ledger", BookOpen, "ledger.view", "ACCOUNTS & REPORTS"],
              [
                "Reports",
                ChartNoAxesCombined,
                "report.view",
                "ACCOUNTS & REPORTS",
              ],
              ["Adjustments & Reversals", RotateCcw, "audit.view", "AUDIT"],
              ["Audit Trail", Activity, "audit.view", "AUDIT"],
              ["Administration", UserCog, "user.manage", "ADMINISTRATION"],
            ];
  return (
    <>
      <aside>
        <div className="brand">
          <div className="brand-mark">
            {branding.logo ? (
              <img src={branding.logo} alt="System logo" />
            ) : (
              <Wifi size={24} />
            )}
          </div>
          <div>
            <span
              className="system-brand-name"
              title={user.system?.displayName}
            >
              {user.system?.displayName || "BCIS"}
            </span>
            <small>
              {systemAdmin
                ? "System administration"
                : collectionSupervisor
                  ? "Collection supervision"
                  : auditor
                    ? "Audit & review"
                    : technician
                      ? "Field service"
                      : "Billing & Collections"}
            </small>
          </div>
        </div>
        <div className="workspace">
          <span className="live-dot" /> Main office <span>LAN</span>
        </div>
        <nav>
          {nav
            .filter((n) => can(n[2]))
            .map(([label, Icon, , section], i, visible) => (
              <React.Fragment key={label}>
                {section !== visible[i - 1]?.[3] && (
                  <div className="nav-label">{section}</div>
                )}
                <button
                  aria-label={label}
                  className={page === label ? "active" : ""}
                  onClick={() => navigate(label)}
                >
                  <Icon size={18} />
                  {label}
                  {label === "GCash Verification" && (
                    <span className="nav-tag">Review</span>
                  )}
                </button>
              </React.Fragment>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="live-dot" /> Central API connection
          <small>
            {systemAdmin
              ? "System administration"
              : "All amounts in Philippine peso"}
          </small>
        </div>
        {user.system?.supportContact && (
          <div className="system-support">
            <strong>Support</strong>
            <span>{user.system.supportContact}</span>
          </div>
        )}
        <div className="user">
          <div className="avatar">
            {user.profile_image ? (
              <img src={user.profile_image} alt="Your profile" />
            ) : (
              user.name.slice(0, 2).toUpperCase()
            )}
          </div>
          <div>
            {user.name}
            <small>{user.roles.join(", ")}</small>
          </div>
          <button
            title="Lock and sign out"
            onClick={() =>
              run(async () => {
                await api("/logout", {});
                setSessionToken("");
                setUser(null);
                setData(null);
              })
            }
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
    </>
  );
}
