"use strict";
const mysql = require("mysql2/promise");
const employment = require("./employment-date-v1054.js");
const pool = mysql.createPool({
  host: process.env.DB_HOST || process.env.MYSQLHOST || "localhost",
  port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
  user: process.env.DB_USER || process.env.MYSQLUSER || "root",
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || "",
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || process.env.DATABASE_NAME || "sistema_gestion",
  waitForConnections: true, connectionLimit: 3, queueLimit: 0,
  timezone: "Z", dateStrings: true
});
const qi = (name) => "`" + String(name).replace(/`/g, "``") + "`";
let schemaCache = null;
async function columns(table) { const [rows] = await pool.query(`SHOW COLUMNS FROM ${qi(table)}`); return rows.map(r => r.Field); }
const first = (cols, options, required=true) => { const found=options.find(x=>cols.includes(x)); if(!found && required) throw new Error(`No se encontró columna ${options.join("/")}`); return found || null; };
async function schema() {
 if (schemaCache) return schemaCache;
 const [events, attendees, personal, qr, users] = await Promise.all([columns("chc_events"),columns("chc_event_attendees"),columns("personal"),columns("employee_qr_tokens"),columns("chc_admin_users")]);
 schemaCache={
  events: { table:"chc_events", cols:events, id:first(events,["id","event_id"]), name:first(events,["name","title","event_name","nombre"]), date:first(events,["event_date","date","scheduled_at","fecha_evento","starts_at"]), status:first(events,["status","event_status","estado"]), type:first(events,["event_type","type","tipo"],false) },
  attendees: { table:"chc_event_attendees", cols:attendees, id:first(attendees,["id","attendee_id"],false), event:first(attendees,["event_id","chc_event_id"]), employee:first(attendees,["employee_number","employee_id","numero_empleado"]), attended:first(attendees,["attended_at","attendance_at","checked_in_at","fecha_asistencia"],false), method:first(attendees,["attendance_method","checkin_method","method","metodo_asistencia"],false), prize:first(attendees,["prize_type","award_type","reward_type","premio","gift_type"],false), prizeAt:first(attendees,["prize_at","awarded_at","rewarded_at","gift_delivered_at","fecha_premio"],false), eff: attendees.includes("effective_start_date_snapshot") ? "effective_start_date_snapshot" : null, dateType: attendees.includes("employment_date_type_snapshot") ? "employment_date_type_snapshot" : null, group: attendees.includes("seniority_group_snapshot") ? "seniority_group_snapshot" : null, seniorityText: attendees.includes("seniority_text_snapshot") ? "seniority_text_snapshot" : null },
  personal: { table:"personal", cols:personal, employee:first(personal,["employee_number","employee_id","numero_empleado"]), name:first(personal,["full_name","name","nombre_completo","nombre"]), position:first(personal,["puesto","job_title","position"],false), department:first(personal,["department_name","departamento","department"],false), start:first(personal,["start_date","fecha_ingreso"]), reentry:first(personal,["fecha_reingreso","reentry_date"],false) },
  qr: { table:"employee_qr_tokens", cols:qr, employee:first(qr,["employee_number","employee_id","numero_empleado"]), token:first(qr,["token","qr_token","public_token"]), active:first(qr,["is_active","active","status"],false) },
  users: { table:"chc_admin_users", cols:users, role:first(users,["role","rol"]) }
 };
 return schemaCache;
}
function role(req) { const u=req.session?.user || req.session?.adminUser || req.session?.admin || req.user || {}; return String(u.role || u.rol || req.session?.role || "").toLowerCase(); }
function normalizedRole(req) { const r=role(req); if (["hr","capital_humano","capitalhumano"].includes(r)) return "hr"; if (["event_operator","operador_eventos","operator"].includes(r)) return "event_operator"; return r; }
function requireRoles(...roles) { return (req,res,next)=> roles.includes(normalizedRole(req)) ? next() : (req.accepts("json") && !req.accepts("html") ? res.status(403).json({ok:false,message:"No tienes permiso para realizar esta acción."}) : res.status(403).send("No tienes permiso para realizar esta acción.")); }
function closedValue(current) { const v=String(current||""); if(v===v.toUpperCase() && v) return "CLOSED"; if(v.toLowerCase()==="abierto") return "cerrado"; return "closed"; }
function isClosed(value) { return ["closed","cerrado","finalizado","inactive"].includes(String(value||"").toLowerCase()); }
function eventDateOnly(value) { return employment.toDateOnly(value); }
module.exports={ pool, qi, schema, employment, role, normalizedRole, requireRoles, closedValue, isClosed, eventDateOnly };
