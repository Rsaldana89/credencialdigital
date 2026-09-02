"use strict";
function role(req){const u=req.session?.user||req.session?.adminUser||req.session?.admin||req.user||{};const r=String(u.role||u.rol||req.session?.role||"").toLowerCase();return ["operador_eventos","operator"].includes(r)?"event_operator":r;}
module.exports=function v1054RoleGate(req,res,next){
 const r=role(req);res.locals.currentRole=r;res.locals.isEventOperator=r==="event_operator";
 if(r!=="event_operator")return next();
 const p=req.path.toLowerCase();
 if(!p.startsWith("/admin"))return next();
 if(p==="/admin/v1054/session")return next();
 if(p==="/admin"||p==="/admin/")return res.redirect("/admin/events");
 if(!p.startsWith("/admin/events"))return res.status(403).send("Tu perfil solo tiene acceso a la operación de eventos.");
 if(/(export|excel|pdf|create|new|users|employees|photos|fotograf|credential-pack|advanced)/.test(p))return res.status(403).send("Tu perfil no tiene permiso para esta función.");
 if(["POST","PUT","PATCH","DELETE"].includes(req.method)){
  const allowed=/(scan|attendance|asistencia|check|prize|premio|consol|award|reward|search|buscar|lookup)/.test(p);
  const forbidden=/(close|cerrar|rename|renombrar|guest|invite|invitad|delete|remove)/.test(p);
  if(!allowed||forbidden)return res.status(403).send("Tu perfil no tiene permiso para modificar la configuración del evento.");
 }
 next();
};
