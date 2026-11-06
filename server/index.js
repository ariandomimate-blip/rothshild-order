import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { mountTelegramShop } from './telegram-shop.js';

const app=express(), {Pool}=pg;
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false});
const prod=process.env.NODE_ENV==='production';
if(!process.env.JWT_SECRET || process.env.JWT_SECRET.length<32) {
  if(prod) throw new Error('Production startup blocked: JWT_SECRET must be a unique random secret of at least 32 characters.');
  console.warn('WARN: Set a unique JWT_SECRET of at least 32 characters before deployment.');
}
if(prod && !process.env.APP_ORIGIN) throw new Error('Production startup blocked: APP_ORIGIN must be set to the exact HTTPS origin.');
if(prod && !process.env.APP_ORIGIN.startsWith('https://')) throw new Error('Production startup blocked: APP_ORIGIN must use HTTPS.');
// Render terminates TLS at its edge; trust only its immediate proxy for secure-cookie/request metadata.
app.set('trust proxy',1);
// Render terminates TLS at its edge. Compare writes against the actual request origin
// (the deployed host) and the optional configured canonical origin to avoid false 403s
// when a Render alias/custom domain is used, while still rejecting cross-site requests.
const renderOrigins=['https://the-house-of-rothshild-illuminati.onrender.com','https://the-house-of-rothschild-illuminati.onrender.com'];
function normalizedOrigin(value){try{return new URL(value).origin;}catch{return null;}}
function isAllowedBrowserOrigin(value,req){
  const incoming=normalizedOrigin(value);
  if(!incoming)return false;
  const actual=normalizedOrigin(req.protocol+'://'+req.get('host'));
  const configured=normalizedOrigin(process.env.APP_ORIGIN||'');
  return incoming===actual || renderOrigins.includes(incoming) || Boolean(configured&&incoming===configured);
}
app.use((req,res,next)=>{
  if(!['POST','PUT','PATCH','DELETE'].includes(req.method)) return next();
  // Telegram webhook authenticates requests with its secret-token header, not browser Origin.
  if(req.path==='/api/telegram/webhook') return next();
  const origin=req.get('origin');
  if(prod && (!origin || !isAllowedBrowserOrigin(origin,req))) return res.status(403).json({error:'Ungültiger Anfrageursprung'});
  if(origin && !isAllowedBrowserOrigin(origin,req)) return res.status(403).json({error:'Ungültiger Anfrageursprung'});
  next();
});
app.use(helmet({contentSecurityPolicy:{directives:{"default-src":["'self'"],"script-src":["'self'"],"style-src":["'self'"],"img-src":["'self'","data:"],"connect-src":["'self'"],"object-src":["'none'"],"frame-ancestors":["'none'"]}}}));
app.use(cors({origin:(origin,callback)=>{
  if(!origin)return callback(null,false);
  const incoming=normalizedOrigin(origin),configured=normalizedOrigin(process.env.APP_ORIGIN||'');
  if(incoming&&(incoming===configured||renderOrigins.includes(incoming)))return callback(null,true);
  return callback(null,false);
},credentials:true}));
app.use(express.json({limit:'2mb'})); app.use(cookieParser());
app.use('/api/auth',rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:true,legacyHeaders:false,message:{error:'Too many authentication attempts. Please wait and try again.'}}));
app.use('/api/admin',rateLimit({windowMs:60*1000,limit:30,standardHeaders:true,legacyHeaders:false}));
app.use('/api/conversations',rateLimit({windowMs:60*1000,limit:40,standardHeaders:true,legacyHeaders:false}));
const q=(s,v=[])=>pool.query(s,v);
const cookieOpts={httpOnly:true,secure:prod || process.env.COOKIE_SECURE==='true',sameSite:'strict',path:'/'};
function tokenFor(u){return jwt.sign({sub:u.id,role:u.role,status:u.status},process.env.JWT_SECRET,{expiresIn:'2h',issuer:'rothshild-platform'});}
async function auth(req,res,next){
 try{const t=req.cookies.session;if(!t)return res.status(401).json({error:'Anmeldung erforderlich'});const p=jwt.verify(t,process.env.JWT_SECRET,{issuer:'rothshild-platform'});const r=await q('SELECT id,email,display_name,role,status FROM users WHERE id=$1',[p.sub]);if(!r.rowCount)return res.status(401).json({error:'Konto nicht gefunden'});req.user=r.rows[0];next();}catch{return res.status(401).json({error:'Sitzung ungültig oder abgelaufen'});}
}
const roles=(...allowed)=>(req,res,next)=>allowed.includes(req.user.role)?next():res.status(403).json({error:'Keine Berechtigung'});
const approved=(req,res,next)=>req.user.status==='approved'?next():res.status(403).json({error:'Mitgliedschaft noch nicht freigeschaltet'});
const clean=(v,max=4000)=>String(v??'').trim().slice(0,max);
function messageKey(){const raw=process.env.MESSAGE_ENCRYPTION_KEY||'';const key=Buffer.from(raw,'base64');if(key.length!==32)throw new Error('MESSAGE_ENCRYPTION_KEY must be a base64-encoded 32-byte key');return key;}
function encryptMessage(plain){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',messageKey(),iv);const data=Buffer.concat([cipher.update(plain,'utf8'),cipher.final()]);return JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')});}
function decryptMessage(value){const box=JSON.parse(value);if(box.v!==1)throw new Error('Unsupported encrypted message');const decipher=createDecipheriv('aes-256-gcm',messageKey(),Buffer.from(box.iv,'base64'));decipher.setAuthTag(Buffer.from(box.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(box.data,'base64')),decipher.final()]).toString('utf8');}
async function isConversationMember(id,userId){const r=await q('SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2',[id,userId]);return r.rowCount>0;}

async function notifyAdmins(subject,text,replyTo){if(!process.env.SMTP_HOST||!process.env.SMTP_USER||!process.env.SMTP_PASS||!process.env.SMTP_FROM)throw new Error('SMTP nicht konfiguriert');const nodemailer=(await import('nodemailer')).default;const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});return transporter.sendMail({from:process.env.SMTP_FROM,to:'adiphenex@gmail.com',cc:'rothschildofficial938@gmail.com',replyTo,subject,text});}

app.get('/api/health',(req,res)=>res.json({ok:true}));
app.post('/api/applications',rateLimit({windowMs:60*60*1000,limit:5,standardHeaders:true,legacyHeaders:false}),async(req,res)=>{
 const fullName=clean(req.body?.fullName,120),email=clean(req.body?.email,254).toLowerCase(),address=clean(req.body?.address,300),goals=clean(req.body?.goals,4000),motivation=clean(req.body?.motivation,4000);
 if(fullName.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||address.length<5||goals.length<2||motivation.length<2)return res.status(400).json({error:'Bitte alle Pflichtfelder vollständig und mit gültiger E-Mail-Adresse ausfüllen.'});
 const body=['Neue Mitgliedschaftsbewerbung','', 'Vollständiger Name: '+fullName,'E-Mail-Adresse: '+email,'Anschrift: '+address,'','Persönliche Ziele:',goals,'','Motivation:',motivation].join('\\n');
 try{
  await notifyAdmins('Mitgliedschaftsbewerbung – '+fullName,body,email);
  return res.status(201).json({ok:true,message:'Deine Bewerbung wurde per E-Mail an die Administration übermittelt.'});
 }catch(e){
  console.error('Application email failed:',e.message);
  return res.status(503).json({error:'Der direkte E-Mail-Versand ist gerade nicht verfügbar. Bitte nutze die vorbereitete E-Mail-App.'});
 }
});

app.post('/api/auth/register',async(req,res)=>{
 const email=clean(req.body.email,254).toLowerCase(), name=clean(req.body.displayName,70), password=String(req.body.password||'');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||name.length<2||password.length<12)return res.status(400).json({error:'Bitte gültige E-Mail, Anzeigename und Passwort mit mindestens 12 Zeichen angeben.'});
 try{const hash=await bcrypt.hash(password,12);const ownerEmail=(process.env.SITE_OWNER_EMAIL||'gaussa72@gmail.com').toLowerCase();const status=email===ownerEmail?'approved':'pending';await q('INSERT INTO users(email,display_name,password_hash,status) VALUES($1,$2,$3,$4)',[email,name,hash,status]);res.status(201).json({message:status==='approved'?'Konto erstellt und freigeschaltet. Du kannst dich jetzt anmelden.':'Antrag eingegangen. Freischaltung durch die Administration erforderlich.'});}
 catch(e){res.status(e.code==='23505'?409:500).json({error:e.code==='23505'?'E-Mail bereits registriert':'Registrierung derzeit nicht möglich'});}
});
app.post('/api/auth/login',async(req,res)=>{
 const email=clean(req.body.email,254).toLowerCase(), password=String(req.body.password||'');
 const r=await q('SELECT id,email,display_name,password_hash,role,status FROM users WHERE email=$1',[email]);
 if(!r.rowCount||!(await bcrypt.compare(password,r.rows[0].password_hash)))return res.status(401).json({error:'Anmeldedaten ungültig'});
 let u=r.rows[0];const ownerEmail=(process.env.SITE_OWNER_EMAIL||'gaussa72@gmail.com').toLowerCase();if(u.email.toLowerCase()===ownerEmail&&u.status!=='approved'){const updated=await q("UPDATE users SET status='approved' WHERE id=$1 RETURNING id,email,display_name,role,status",[u.id]);if(updated.rowCount)u=updated.rows[0];}res.cookie('session',tokenFor(u),{...cookieOpts,maxAge:2*60*60*1000});
 res.json({user:{id:u.id,email:u.email,displayName:u.display_name,role:u.role,status:u.status}});
});
app.post('/api/auth/logout',(req,res)=>res.clearCookie('session',cookieOpts).json({ok:true}));
app.get('/api/me',auth,(req,res)=>res.json({user:req.user}));
app.get('/api/forum/categories',auth,async(req,res)=>{const r=await q("SELECT * FROM forum_categories WHERE access_level='applicant' OR $1='approved' ORDER BY title",[req.user.status]);res.json(r.rows);});
app.get('/api/forum/posts',auth,async(req,res)=>{
 const slug=clean(req.query.category,50);const r=await q(`SELECT p.id,p.title,p.body,p.created_at,u.display_name,c.slug AS category FROM forum_posts p JOIN users u ON u.id=p.author_id JOIN forum_categories c ON c.id=p.category_id WHERE p.status='published' AND ($1='' OR c.slug=$1) AND (c.access_level='applicant' OR $2='approved') ORDER BY p.created_at DESC LIMIT 100`,[slug,req.user.status]);res.json(r.rows);
});
app.post('/api/forum/posts',auth,async(req,res)=>{
 const title=clean(req.body.title,140),body=clean(req.body.body,5000),slug=clean(req.body.category,50);
 if(title.length<4||body.length<2)return res.status(400).json({error:'Titel und Text erforderlich'});
 const c=await q('SELECT id,access_level FROM forum_categories WHERE slug=$1',[slug]);if(!c.rowCount)return res.status(404).json({error:'Bereich nicht gefunden'});
 if(c.rows[0].access_level==='member'&&req.user.status!=='approved')return res.status(403).json({error:'Nur für freigeschaltete Mitglieder'});
 const r=await q('INSERT INTO forum_posts(category_id,author_id,title,body) VALUES($1,$2,$3,$4) RETURNING id',[c.rows[0].id,req.user.id,title,body]);try{await notifyAdmins('Neuer Forumsbeitrag: '+title,`Mitglied: ${req.user.display_name} (${req.user.email})\nBereich: ${slug}\nTitel: ${title}\n\n${body}` ,req.user.email)}catch(e){console.error('Forum notification mail failed:',e.message)}res.status(201).json({id:r.rows[0].id,notificationSent:true});
});
app.get('/api/library',auth,async(req,res)=>{const r=await q("SELECT id,title,topic,summary,body,source_note,visibility FROM library_items WHERE visibility='public' OR $1='approved' ORDER BY created_at DESC",[req.user.status]);res.json(r.rows);});
app.get('/api/admin/users',auth,roles('admin','moderator'),async(req,res)=>{const r=await q('SELECT id,email,display_name,role,status,created_at FROM users ORDER BY created_at DESC LIMIT 300');res.json(r.rows);});
app.patch('/api/admin/users/:id',auth,roles('admin'),async(req,res)=>{
 const status=['pending','approved','rejected','suspended'].includes(req.body.status)?req.body.status:null;
 const role=['applicant','member','mentor','moderator','admin'].includes(req.body.role)?req.body.role:null;
 if(!status&&!role)return res.status(400).json({error:'Keine gültige Änderung'});
 const r=await q('UPDATE users SET status=COALESCE($1,status),role=COALESCE($2,role) WHERE id=$3 RETURNING id,email,display_name,role,status',[status,role,req.params.id]);
 if(!r.rowCount)return res.status(404).json({error:'Mitglied nicht gefunden'});await q('INSERT INTO security_audit_log(actor_user_id,action,target_user_id,details) VALUES($1,$2,$3,$4::jsonb)',[req.user.id,'admin.user.updated',r.rows[0].id,JSON.stringify({status:status||undefined,role:role||undefined})]);res.json(r.rows[0]);
});
app.post('/api/admin/mentor-assignments',auth,roles('admin'),async(req,res)=>{
 const member=clean(req.body.memberId,60),mentor=clean(req.body.mentorId,60);
 const m=await q("SELECT id FROM users WHERE id=$1 AND status='approved'",[member]),t=await q("SELECT id FROM users WHERE id=$1 AND role='mentor' AND status='approved'",[mentor]);
 if(!m.rowCount||!t.rowCount)return res.status(400).json({error:'Freigeschaltetes Mitglied und freigeschalteter Mentor erforderlich'});
 const r=await q('INSERT INTO mentor_assignments(member_id,mentor_id,assigned_by) VALUES($1,$2,$3) ON CONFLICT(member_id,mentor_id) DO UPDATE SET status=$4,member_accepted_at=NULL,mentor_accepted_at=NULL RETURNING id',[member,mentor,req.user.id,'invited']);res.status(201).json({assignmentId:r.rows[0].id,status:'invited'});
});
app.post('/api/mentor-assignments/:id/respond',auth,approved,async(req,res)=>{
 try{
  const accept=req.body.accept===true;
  let r;
  if(!accept){
   r=await q("UPDATE mentor_assignments SET status='declined' WHERE id=$1 AND (member_id=$2 OR mentor_id=$2) AND status='invited' RETURNING *",[req.params.id,req.user.id]);
  }else{
   r=await q(`UPDATE mentor_assignments SET
    member_accepted_at=CASE WHEN member_id=$2 THEN COALESCE(member_accepted_at,now()) ELSE member_accepted_at END,
    mentor_accepted_at=CASE WHEN mentor_id=$2 THEN COALESCE(mentor_accepted_at,now()) ELSE mentor_accepted_at END,
    status=CASE WHEN
     (CASE WHEN member_id=$2 THEN true ELSE member_accepted_at IS NOT NULL END)
     AND (CASE WHEN mentor_id=$2 THEN true ELSE mentor_accepted_at IS NOT NULL END)
     THEN 'accepted' ELSE 'invited' END
    WHERE id=$1 AND (member_id=$2 OR mentor_id=$2) AND status='invited' RETURNING *`,[req.params.id,req.user.id]);
  }
  if(!r.rowCount)return res.status(404).json({error:'Einladung nicht gefunden oder bereits beantwortet.'});
  const a=r.rows[0];
  if(a.status==='accepted'){
   const c=await q('SELECT id FROM conversations WHERE assignment_id=$1 LIMIT 1',[a.id]);
   let conversationId=c.rows[0]?.id;
   if(!conversationId){const created=await q('INSERT INTO conversations(assignment_id) VALUES($1) RETURNING id',[a.id]);conversationId=created.rows[0].id;}
   await q('INSERT INTO conversation_members(conversation_id,user_id) VALUES($1,$2),($1,$3) ON CONFLICT DO NOTHING',[conversationId,a.member_id,a.mentor_id]);
  }
  res.json({status:a.status,waitingForOther:a.status==='invited'&&accept});
 }catch(e){console.error('Mentor invitation response failed:',e.message);res.status(500).json({error:'Einladung konnte nicht verarbeitet werden.'});}
});

app.post('/api/mentor/request',auth,rateLimit({windowMs:60*60*1000,limit:4}),async(req,res)=>{const topic=clean(req.body.topic,140),message=clean(req.body.message,2500);if(topic.length<3||message.length<10)return res.status(400).json({error:'Bitte Thema und Nachricht eingeben.'});try{await notifyAdmins('Mentorenanfrage von '+req.user.display_name, 'Mitglied: '+req.user.display_name+' ('+req.user.email+')\nThema: '+topic+'\n\nAnfrage:\n'+message,req.user.email);res.status(201).json({ok:true,message:'Mentorenanfrage an die Administration gesendet.'});}catch(e){res.status(503).json({error:'E-Mail-Versand derzeit nicht verfügbar.'});}});
app.get('/api/mentor-assignments',auth,async(req,res)=>{const r=await q('SELECT a.*,m.display_name AS member_name,t.display_name AS mentor_name FROM mentor_assignments a JOIN users m ON m.id=a.member_id JOIN users t ON t.id=a.mentor_id WHERE a.member_id=$1 OR a.mentor_id=$1 ORDER BY a.created_at DESC',[req.user.id]);res.json(r.rows);});
// Private mentor messaging. Messages are encrypted at rest with AES-256-GCM;
// transport is protected by HTTPS and access is restricted to accepted conversation members.
// This is server-side encryption, NOT end-to-end encryption.
app.get('/api/conversations',auth,approved,async(req,res)=>{
 try{
  const r=await q(`SELECT c.id, other.display_name AS other_name, other.role AS other_role
   FROM conversations c
   JOIN mentor_assignments a ON a.id=c.assignment_id AND a.status='accepted'
   JOIN conversation_members mine ON mine.conversation_id=c.id AND mine.user_id=$1
   JOIN conversation_members theirs ON theirs.conversation_id=c.id AND theirs.user_id<>$1
   JOIN users other ON other.id=theirs.user_id AND other.status='approved'
   ORDER BY c.created_at DESC`,[req.user.id]);
  res.json(r.rows);
 }catch(e){console.error('Conversation list failed:',e.message);res.status(500).json({error:'Chats konnten nicht geladen werden.'});}
});
app.get('/api/conversations/:id/messages',auth,approved,async(req,res)=>{
 try{
  if(!await isConversationMember(req.params.id,req.user.id))return res.status(403).json({error:'Kein Zugriff auf diesen Chat.'});
  const r=await q('SELECT id,sender_id,ciphertext,created_at FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 100',[req.params.id]);
  const rows=r.rows.reverse().map(m=>({id:m.id,senderId:m.sender_id,text:decryptMessage(m.ciphertext),createdAt:m.created_at}));
  res.json(rows);
 }catch(e){console.error('Message read failed:',e.message);res.status(503).json({error:'Nachrichten sind derzeit nicht verfügbar. Bitte MESSAGE_ENCRYPTION_KEY (Base64-kodierter 32-Byte-Schlüssel) in Render prüfen.'});}
});
app.post('/api/conversations/:id/messages',auth,approved,rateLimit({windowMs:60*60*1000,limit:120,standardHeaders:true,legacyHeaders:false}),async(req,res)=>{
 try{
  if(!await isConversationMember(req.params.id,req.user.id))return res.status(403).json({error:'Kein Zugriff auf diesen Chat.'});
  const text=clean(req.body?.text,4000);
  if(!text)return res.status(400).json({error:'Bitte eine Nachricht eingeben.'});
  const ciphertext=encryptMessage(text);
  const r=await q('INSERT INTO messages(conversation_id,sender_id,ciphertext) VALUES($1,$2,$3) RETURNING id,created_at',[req.params.id,req.user.id,ciphertext]);
  res.status(201).json({id:r.rows[0].id,senderId:req.user.id,text,createdAt:r.rows[0].created_at});
 }catch(e){console.error('Message send failed:',e.message);res.status(503).json({error:'Nachricht konnte nicht verschlüsselt gespeichert werden. Bitte MESSAGE_ENCRYPTION_KEY (Base64-kodierter 32-Byte-Schlüssel) in Render prüfen.'});}
});

// Public directory: only explicitly approved accounts are visible; never expose emails or password data.
app.get('/api/profiles',async(req,res)=>{
 try{
  const r=await q("SELECT id,display_name,bio,profile_rank,profile_title,avatar_data,cover_data FROM users WHERE status='approved' ORDER BY created_at DESC LIMIT 100");
  res.json({profiles:r.rows.map(p=>({...p,rank:p.profile_rank,title:p.profile_title}))});
 }catch(e){console.error('Public profile listing failed:',e.message);res.status(500).json({error:'Profile konnten nicht geladen werden.'});}
});
app.get('/api/profile',auth,async(req,res)=>{const r=await q('SELECT display_name,bio,profile_rank,profile_title,avatar_data,cover_data FROM users WHERE id=$1',[req.user.id]);if(!r.rowCount)return res.status(404).json({error:'Profil nicht gefunden'});const p=r.rows[0];res.json({profile:{...p,rank:p.profile_rank,title:p.profile_title}});});
app.patch('/api/profile',auth,async(req,res)=>{const name=clean(req.body.displayName,70),bio=clean(req.body.bio,1200),rank=clean(req.body.rank,100),title=clean(req.body.title,100),avatar=String(req.body.avatarData||''),cover=String(req.body.coverData||'');const validImage=v=>!v||(v.length<1250000&&/^data:image\/(png|jpeg|webp|gif);base64,/.test(v));if(name.length<2||!validImage(avatar)||!validImage(cover))return res.status(400).json({error:'Name oder Bildformat/-größe ungültig'});await q('UPDATE users SET display_name=$1,bio=$2,profile_rank=$3,profile_title=$4,avatar_data=$5,cover_data=$6 WHERE id=$7',[name,bio,rank,title,avatar||null,cover||null,req.user.id]);res.json({ok:true});});
app.post('/api/mentor/ai-chat',auth,async(req,res)=>{const message=clean(req.body.message,4000);if(!message)return res.status(400).json({error:'Nachricht fehlt'});if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'KI-Mentor noch nicht aktiviert: OPENAI_API_KEY in Render setzen.'});try{const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4o-mini',messages:[{role:'system',content:'Du bist ein KI-Mentor mit ruhigem, erleuchtetem, spirituell-mystischem und philosophischem Charakter. Antworte warm, respektvoll und kritisch denkend. Unterscheide belegte Geschichte von Legenden und Spekulationen. Behaupte keine geheimen Mächte oder gesicherte Mitgliedschaft. Du bist eine KI, kein menschlicher Mentor oder Therapeut.'},{role:'user',content:message}],temperature:0.7})});const data=await response.json();if(!response.ok)throw Error(data.error?.message||'KI-Anfrage fehlgeschlagen');res.json({reply:data.choices?.[0]?.message?.content||'Ich kann darauf gerade nicht antworten.'})}catch(e){res.status(502).json({error:'KI-Mentor derzeit nicht erreichbar.'});}});


const shopOrderLimit=rateLimit({windowMs:60*60*1000,limit:8,standardHeaders:true,legacyHeaders:false});
const SHOP_CATALOG={
 'Royal Shield':100,
 'Mobility Staff':200,
 'Power Ring':400,
 'Royal Silver Bar':350,
 'Menorah Pendant Necklace':215,
 'Amber Glass Candle':130
};
app.post('/api/shop/orders',shopOrderLimit,async(req,res)=>{
 try{
  const customerName=clean(req.body?.customerName,100);
  const customerEmail=clean(req.body?.customerEmail,254).toLowerCase();
  const customerAddress=clean(req.body?.customerAddress,500);
  const orderNumber=clean(req.body?.orderNumber,40);
  const rawItems=Array.isArray(req.body?.items)?req.body.items:[];
  if(customerName.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)||customerAddress.length<8||!/^RO-[0-9]{8}-[A-F0-9]{10}$/.test(orderNumber)||rawItems.length<1||rawItems.length>20){
   return res.status(400).json({error:'Bitte Name, gültige E-Mail, vollständige Adresse, Bestellnummer und Warenkorb prüfen.'});
  }
  const items=[];
  for(const item of rawItems){
   const name=clean(item?.name,100),quantity=Number(item?.quantity);
   if(!Object.hasOwn(SHOP_CATALOG,name)||!Number.isInteger(quantity)||quantity<1||quantity>25){
    return res.status(400).json({error:'Ungültiges Produkt oder ungültige Menge im Warenkorb.'});
   }
   items.push({name,quantity,unitPrice:SHOP_CATALOG[name],lineTotal:SHOP_CATALOG[name]*quantity});
  }
  const total=items.reduce((sum,item)=>sum+item.lineTotal,0);
  const lines=[
   'Neue Shop-Bestellanfrage',
   'Bestellnummer: '+orderNumber,\n   'Erstellt am: '+new Date().toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Berlin'}),\n   'Dokument: Bestellübersicht / unverbindliche Bestellanfrage (keine Rechnung im steuerrechtlichen Sinn)',
   'Name: '+customerName,
   'E-Mail: '+customerEmail,
   'Lieferadresse: '+customerAddress,
   '',
   ...items.map(item=>item.name+' | Einzelpreis: 
   '',
   'Warenwert: 
   '',
   'Status: Anfrage eingegangen; Zahlung und Verfügbarkeit sind NICHT bestätigt.',
   'Bitte Versandkosten und Endpreis vor einer Zahlungsaufforderung bestätigen.'
  ];
  // Optional direct email via SMTP. If SMTP is not configured, the checkout
  // continues to the prepared mailto handoff; no email is claimed as sent.
  const mailSubject='Shop-Bestellung '+orderNumber;
  const mailText=lines.join('\\n');
  let emailSent=false;
  if(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS&&process.env.SMTP_FROM){
   const nodemailer=(await import('nodemailer')).default;
   const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
   await transporter.sendMail({from:process.env.SMTP_FROM,to:'rothschildofficial938@gmail.com',replyTo:customerEmail,subject:mailSubject,text:mailText});
   emailSent=true;
  } else {
   console.warn('SMTP not configured: order email will be prepared for the customer to send from their email app.');
  }
  if(!process.env.TELEGRAM_BOT_TOKEN||!process.env.TELEGRAM_ADMIN_CHAT_ID){
   console.warn('Telegram order notification skipped: credentials not configured.');
   return res.status(201).json({ok:true,orderNumber,total,items,emailSent,telegramSent:false});
  }
  const tg=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/sendMessage',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({chat_id:process.env.TELEGRAM_ADMIN_CHAT_ID,text:lines.join('\n'),disable_web_page_preview:true})
  });
  const tgData=await tg.json().catch(()=>({}));
  if(!tg.ok||tgData.ok!==true){
   console.error('Telegram order notification failed; email order was accepted:',tgData.description||tg.status);
   // Email is the primary order channel; keep checkout successful if optional Telegram fails.
   return res.status(201).json({ok:true,orderNumber,total,items,emailSent,telegramSent:false});
  }
  res.status(201).json({ok:true,orderNumber,total,items,emailSent});
 }catch(e){
  console.error('Shop order failed:',e.message);
  res.status(500).json({error:'Bestellung konnte nicht übermittelt werden.'});
 }
});

// Serve approved gallery media from repository-root assets under a stable, versioned path.
const communityAssets = new Set(['IMG_6328.jpeg','IMG_6334.jpeg','IMG_6335.jpeg','IMG_6336.jpeg','IMG_6337.jpeg','IMG_6338.jpeg','IMG_6339.jpeg','IMG_6374.jpeg','IMG_6376.jpeg','IMG_6377.jpeg','IMG_6378.jpeg','IMG_6382.jpeg','IMG_6383.jpeg','telegram_video.mp4']);
app.get('/community-assets/:asset', (req,res,next)=>{
  const asset=req.params.asset;
  if(!communityAssets.has(asset)) return res.sendStatus(404);
  res.set('Cache-Control','public, max-age=86400, stale-while-revalidate=604800');
  res.sendFile(path.resolve(__dirname,'..',asset), err=>{ if(err && !res.headersSent) next(err); });
});
// Backwards-compatible URLs for older page versions.
for (const asset of communityAssets) app.get('/'+asset, (req,res)=>res.redirect(302,'/community-assets/'+asset));
if (process.env.DATABASE_URL) await mountTelegramShop(app,pool);
app.use(express.static(path.join(__dirname,'../public')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'../public/index.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Interner Fehler'});});
const port=Number(process.env.PORT||3000);
const schema=await readFile(path.join(__dirname,'schema.sql'),'utf8');
if(process.env.DATABASE_URL) await pool.query(schema); else console.warn('DATABASE_URL missing: database features are disabled until configured.');
app.listen(port,()=>console.log(`ROTHSHILD platform listening on ${port}`));
+item.unitPrice.toFixed(2)+' | Menge: '+item.quantity+' | Summe: 
   '',
   'Warenwert: '+total.toFixed(2),
   '',
   'Status: Anfrage eingegangen; Zahlung und Verfügbarkeit sind NICHT bestätigt.',
   'Bitte Versandkosten und Endpreis vor einer Zahlungsaufforderung bestätigen.'
  ];
  // Optional direct email via SMTP. If SMTP is not configured, the checkout
  // continues to the prepared mailto handoff; no email is claimed as sent.
  const mailSubject='Shop-Bestellung '+orderNumber;
  const mailText=lines.join('\\n');
  let emailSent=false;
  if(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS&&process.env.SMTP_FROM){
   const nodemailer=(await import('nodemailer')).default;
   const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
   await transporter.sendMail({from:process.env.SMTP_FROM,to:'rothschildofficial938@gmail.com',replyTo:customerEmail,subject:mailSubject,text:mailText});
   emailSent=true;
  } else {
   console.warn('SMTP not configured: order email will be prepared for the customer to send from their email app.');
  }
  if(!process.env.TELEGRAM_BOT_TOKEN||!process.env.TELEGRAM_ADMIN_CHAT_ID){
   console.warn('Telegram order notification skipped: credentials not configured.');
   return res.status(201).json({ok:true,orderNumber,total,items,emailSent,telegramSent:false});
  }
  const tg=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/sendMessage',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({chat_id:process.env.TELEGRAM_ADMIN_CHAT_ID,text:lines.join('\n'),disable_web_page_preview:true})
  });
  const tgData=await tg.json().catch(()=>({}));
  if(!tg.ok||tgData.ok!==true){
   console.error('Telegram order notification failed; email order was accepted:',tgData.description||tg.status);
   // Email is the primary order channel; keep checkout successful if optional Telegram fails.
   return res.status(201).json({ok:true,orderNumber,total,items,emailSent,telegramSent:false});
  }
  res.status(201).json({ok:true,orderNumber,total,items,emailSent});
 }catch(e){
  console.error('Shop order failed:',e.message);
  res.status(500).json({error:'Bestellung konnte nicht übermittelt werden.'});
 }
});

// Serve approved gallery media from repository-root assets under a stable, versioned path.
const communityAssets = new Set(['IMG_6328.jpeg','IMG_6334.jpeg','IMG_6335.jpeg','IMG_6336.jpeg','IMG_6337.jpeg','IMG_6338.jpeg','IMG_6339.jpeg','IMG_6374.jpeg','IMG_6376.jpeg','IMG_6377.jpeg','IMG_6378.jpeg','IMG_6382.jpeg','IMG_6383.jpeg','telegram_video.mp4']);
app.get('/community-assets/:asset', (req,res,next)=>{
  const asset=req.params.asset;
  if(!communityAssets.has(asset)) return res.sendStatus(404);
  res.set('Cache-Control','public, max-age=86400, stale-while-revalidate=604800');
  res.sendFile(path.resolve(__dirname,'..',asset), err=>{ if(err && !res.headersSent) next(err); });
});
// Backwards-compatible URLs for older page versions.
for (const asset of communityAssets) app.get('/'+asset, (req,res)=>res.redirect(302,'/community-assets/'+asset));
if (process.env.DATABASE_URL) await mountTelegramShop(app,pool);
app.use(express.static(path.join(__dirname,'../public')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'../public/index.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Interner Fehler'});});
const port=Number(process.env.PORT||3000);
const schema=await readFile(path.join(__dirname,'schema.sql'),'utf8');
if(process.env.DATABASE_URL) await pool.query(schema); else console.warn('DATABASE_URL missing: database features are disabled until configured.');
app.listen(port,()=>console.log(`ROTHSHILD platform listening on ${port}`));
+item.lineTotal.toFixed(2)),
   '',
   'Warenwert: '+total.toFixed(2),
   '',
   'Status: Anfrage eingegangen; Zahlung und Verfügbarkeit sind NICHT bestätigt.',
   'Bitte Versandkosten und Endpreis vor einer Zahlungsaufforderung bestätigen.'
  ];
  // Optional direct email via SMTP. If SMTP is not configured, the checkout
  // continues to the prepared mailto handoff; no email is claimed as sent.
  const mailSubject='Shop-Bestellung '+orderNumber;
  const mailText=lines.join('\\n');
  let emailSent=false;
  if(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS&&process.env.SMTP_FROM){
   const nodemailer=(await import('nodemailer')).default;
   const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
   await transporter.sendMail({from:process.env.SMTP_FROM,to:'rothschildofficial938@gmail.com',replyTo:customerEmail,subject:mailSubject,text:mailText});
   emailSent=true;
  } else {
   console.warn('SMTP not configured: order email will be prepared for the customer to send from their email app.');
  }
  if(!process.env.TELEGRAM_BOT_TOKEN||!process.env.TELEGRAM_ADMIN_CHAT_ID){
   console.warn('Telegram order notification skipped: credentials not configured.');
   return res.status(201).json({ok:true,orderNumber,total,items,emailSent,telegramSent:false});
  }
  const tg=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/sendMessage',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({chat_id:process.env.TELEGRAM_ADMIN_CHAT_ID,text:lines.join('\n'),disable_web_page_preview:true})
  });
  const tgData=await tg.json().catch(()=>({}));
  if(!tg.ok||tgData.ok!==true){
   console.error('Telegram order notification failed; email order was accepted:',tgData.description||tg.status);
   // Email is the primary order channel; keep checkout successful if optional Telegram fails.
   return res.status(201).json({ok:true,orderNumber,total,items,emailSent,telegramSent:false});
  }
  res.status(201).json({ok:true,orderNumber,total,items,emailSent});
 }catch(e){
  console.error('Shop order failed:',e.message);
  res.status(500).json({error:'Bestellung konnte nicht übermittelt werden.'});
 }
});

// Serve approved gallery media from repository-root assets under a stable, versioned path.
const communityAssets = new Set(['IMG_6328.jpeg','IMG_6334.jpeg','IMG_6335.jpeg','IMG_6336.jpeg','IMG_6337.jpeg','IMG_6338.jpeg','IMG_6339.jpeg','IMG_6374.jpeg','IMG_6376.jpeg','IMG_6377.jpeg','IMG_6378.jpeg','IMG_6382.jpeg','IMG_6383.jpeg','telegram_video.mp4']);
app.get('/community-assets/:asset', (req,res,next)=>{
  const asset=req.params.asset;
  if(!communityAssets.has(asset)) return res.sendStatus(404);
  res.set('Cache-Control','public, max-age=86400, stale-while-revalidate=604800');
  res.sendFile(path.resolve(__dirname,'..',asset), err=>{ if(err && !res.headersSent) next(err); });
});
// Backwards-compatible URLs for older page versions.
for (const asset of communityAssets) app.get('/'+asset, (req,res)=>res.redirect(302,'/community-assets/'+asset));
if (process.env.DATABASE_URL) await mountTelegramShop(app,pool);
app.use(express.static(path.join(__dirname,'../public')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'../public/index.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Interner Fehler'});});
const port=Number(process.env.PORT||3000);
const schema=await readFile(path.join(__dirname,'schema.sql'),'utf8');
if(process.env.DATABASE_URL) await pool.query(schema); else console.warn('DATABASE_URL missing: database features are disabled until configured.');
app.listen(port,()=>console.log(`ROTHSHILD platform listening on ${port}`));
+total.toFixed(2),
   '',
   'Status: Anfrage eingegangen; Zahlung und Verfügbarkeit sind NICHT bestätigt.',
   'Bitte Versandkosten und Endpreis vor einer Zahlungsaufforderung bestätigen.'
  ];
  // Optional direct email via SMTP. If SMTP is not configured, the checkout
  // continues to the prepared mailto handoff; no email is claimed as sent.
  const mailSubject='Shop-Bestellung '+orderNumber;
  const mailText=lines.join('\\n');
  let emailSent=false;
  if(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS&&process.env.SMTP_FROM){
   const nodemailer=(await import('nodemailer')).default;
   const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
   await transporter.sendMail({from:process.env.SMTP_FROM,to:'rothschildofficial938@gmail.com',replyTo:customerEmail,subject:mailSubject,text:mailText});
   emailSent=true;
  } else {
   console.warn('SMTP not configured: order email will be prepared for the customer to send from their email app.');
  }
  if(!process.env.TELEGRAM_BOT_TOKEN||!process.env.TELEGRAM_ADMIN_CHAT_ID){
   console.warn('Telegram order notification skipped: credentials not configured.');
   return res.status(201).json({ok:true,orderNumber,total,items,emailSent,telegramSent:false});
  }
  const tg=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/sendMessage',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({chat_id:process.env.TELEGRAM_ADMIN_CHAT_ID,text:lines.join('\n'),disable_web_page_preview:true})
  });
  const tgData=await tg.json().catch(()=>({}));
  if(!tg.ok||tgData.ok!==true){
   console.error('Telegram order notification failed; email order was accepted:',tgData.description||tg.status);
   // Email is the primary order channel; keep checkout successful if optional Telegram fails.
   return res.status(201).json({ok:true,orderNumber,total,items,emailSent,telegramSent:false});
  }
  res.status(201).json({ok:true,orderNumber,total,items,emailSent});
 }catch(e){
  console.error('Shop order failed:',e.message);
  res.status(500).json({error:'Bestellung konnte nicht übermittelt werden.'});
 }
});

// Serve approved gallery media from repository-root assets under a stable, versioned path.
const communityAssets = new Set(['IMG_6328.jpeg','IMG_6334.jpeg','IMG_6335.jpeg','IMG_6336.jpeg','IMG_6337.jpeg','IMG_6338.jpeg','IMG_6339.jpeg','IMG_6374.jpeg','IMG_6376.jpeg','IMG_6377.jpeg','IMG_6378.jpeg','IMG_6382.jpeg','IMG_6383.jpeg','telegram_video.mp4']);
app.get('/community-assets/:asset', (req,res,next)=>{
  const asset=req.params.asset;
  if(!communityAssets.has(asset)) return res.sendStatus(404);
  res.set('Cache-Control','public, max-age=86400, stale-while-revalidate=604800');
  res.sendFile(path.resolve(__dirname,'..',asset), err=>{ if(err && !res.headersSent) next(err); });
});
// Backwards-compatible URLs for older page versions.
for (const asset of communityAssets) app.get('/'+asset, (req,res)=>res.redirect(302,'/community-assets/'+asset));
if (process.env.DATABASE_URL) await mountTelegramShop(app,pool);
app.use(express.static(path.join(__dirname,'../public')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'../public/index.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Interner Fehler'});});
const port=Number(process.env.PORT||3000);
const schema=await readFile(path.join(__dirname,'schema.sql'),'utf8');
if(process.env.DATABASE_URL) await pool.query(schema); else console.warn('DATABASE_URL missing: database features are disabled until configured.');
app.listen(port,()=>console.log(`ROTHSHILD platform listening on ${port}`));
+item.unitPrice.toFixed(2)+' | Menge: '+item.quantity+' | Summe: 
   '',
   'Warenwert: '+total.toFixed(2),
   '',
   'Status: Anfrage eingegangen; Zahlung und Verfügbarkeit sind NICHT bestätigt.',
   'Bitte Versandkosten und Endpreis vor einer Zahlungsaufforderung bestätigen.'
  ];
  // Optional direct email via SMTP. If SMTP is not configured, the checkout
  // continues to the prepared mailto handoff; no email is claimed as sent.
  const mailSubject='Shop-Bestellung '+orderNumber;
  const mailText=lines.join('\\n');
  let emailSent=false;
  if(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS&&process.env.SMTP_FROM){
   const nodemailer=(await import('nodemailer')).default;
   const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
   await transporter.sendMail({from:process.env.SMTP_FROM,to:'rothschildofficial938@gmail.com',replyTo:customerEmail,subject:mailSubject,text:mailText});
   emailSent=true;
  } else {
   console.warn('SMTP not configured: order email will be prepared for the customer to send from their email app.');
  }
  if(!process.env.TELEGRAM_BOT_TOKEN||!process.env.TELEGRAM_ADMIN_CHAT_ID){
   console.warn('Telegram order notification skipped: credentials not configured.');
   return res.status(201).json({ok:true,orderNumber,total,items,emailSent,telegramSent:false});
  }
  const tg=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/sendMessage',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({chat_id:process.env.TELEGRAM_ADMIN_CHAT_ID,text:lines.join('\n'),disable_web_page_preview:true})
  });
  const tgData=await tg.json().catch(()=>({}));
  if(!tg.ok||tgData.ok!==true){
   console.error('Telegram order notification failed; email order was accepted:',tgData.description||tg.status);
   // Email is the primary order channel; keep checkout successful if optional Telegram fails.
   return res.status(201).json({ok:true,orderNumber,total,items,emailSent,telegramSent:false});
  }
  res.status(201).json({ok:true,orderNumber,total,items,emailSent});
 }catch(e){
  console.error('Shop order failed:',e.message);
  res.status(500).json({error:'Bestellung konnte nicht übermittelt werden.'});
 }
});

// Serve approved gallery media from repository-root assets under a stable, versioned path.
const communityAssets = new Set(['IMG_6328.jpeg','IMG_6334.jpeg','IMG_6335.jpeg','IMG_6336.jpeg','IMG_6337.jpeg','IMG_6338.jpeg','IMG_6339.jpeg','IMG_6374.jpeg','IMG_6376.jpeg','IMG_6377.jpeg','IMG_6378.jpeg','IMG_6382.jpeg','IMG_6383.jpeg','telegram_video.mp4']);
app.get('/community-assets/:asset', (req,res,next)=>{
  const asset=req.params.asset;
  if(!communityAssets.has(asset)) return res.sendStatus(404);
  res.set('Cache-Control','public, max-age=86400, stale-while-revalidate=604800');
  res.sendFile(path.resolve(__dirname,'..',asset), err=>{ if(err && !res.headersSent) next(err); });
});
// Backwards-compatible URLs for older page versions.
for (const asset of communityAssets) app.get('/'+asset, (req,res)=>res.redirect(302,'/community-assets/'+asset));
if (process.env.DATABASE_URL) await mountTelegramShop(app,pool);
app.use(express.static(path.join(__dirname,'../public')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'../public/index.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Interner Fehler'});});
const port=Number(process.env.PORT||3000);
const schema=await readFile(path.join(__dirname,'schema.sql'),'utf8');
if(process.env.DATABASE_URL) await pool.query(schema); else console.warn('DATABASE_URL missing: database features are disabled until configured.');
app.listen(port,()=>console.log(`ROTHSHILD platform listening on ${port}`));
+item.lineTotal.toFixed(2)),
   '',
   'Warenwert: '+total.toFixed(2),
   '',
   'Status: Anfrage eingegangen; Zahlung und Verfügbarkeit sind NICHT bestätigt.',
   'Bitte Versandkosten und Endpreis vor einer Zahlungsaufforderung bestätigen.'
  ];
  // Optional direct email via SMTP. If SMTP is not configured, the checkout
  // continues to the prepared mailto handoff; no email is claimed as sent.
  const mailSubject='Shop-Bestellung '+orderNumber;
  const mailText=lines.join('\\n');
  let emailSent=false;
  if(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS&&process.env.SMTP_FROM){
   const nodemailer=(await import('nodemailer')).default;
   const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
   await transporter.sendMail({from:process.env.SMTP_FROM,to:'rothschildofficial938@gmail.com',replyTo:customerEmail,subject:mailSubject,text:mailText});
   emailSent=true;
  } else {
   console.warn('SMTP not configured: order email will be prepared for the customer to send from their email app.');
  }
  if(!process.env.TELEGRAM_BOT_TOKEN||!process.env.TELEGRAM_ADMIN_CHAT_ID){
   console.warn('Telegram order notification skipped: credentials not configured.');
   return res.status(201).json({ok:true,orderNumber,total,items,emailSent,telegramSent:false});
  }
  const tg=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/sendMessage',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({chat_id:process.env.TELEGRAM_ADMIN_CHAT_ID,text:lines.join('\n'),disable_web_page_preview:true})
  });
  const tgData=await tg.json().catch(()=>({}));
  if(!tg.ok||tgData.ok!==true){
   console.error('Telegram order notification failed; email order was accepted:',tgData.description||tg.status);
   // Email is the primary order channel; keep checkout successful if optional Telegram fails.
   return res.status(201).json({ok:true,orderNumber,total,items,emailSent,telegramSent:false});
  }
  res.status(201).json({ok:true,orderNumber,total,items,emailSent});
 }catch(e){
  console.error('Shop order failed:',e.message);
  res.status(500).json({error:'Bestellung konnte nicht übermittelt werden.'});
 }
});

// Serve approved gallery media from repository-root assets under a stable, versioned path.
const communityAssets = new Set(['IMG_6328.jpeg','IMG_6334.jpeg','IMG_6335.jpeg','IMG_6336.jpeg','IMG_6337.jpeg','IMG_6338.jpeg','IMG_6339.jpeg','IMG_6374.jpeg','IMG_6376.jpeg','IMG_6377.jpeg','IMG_6378.jpeg','IMG_6382.jpeg','IMG_6383.jpeg','telegram_video.mp4']);
app.get('/community-assets/:asset', (req,res,next)=>{
  const asset=req.params.asset;
  if(!communityAssets.has(asset)) return res.sendStatus(404);
  res.set('Cache-Control','public, max-age=86400, stale-while-revalidate=604800');
  res.sendFile(path.resolve(__dirname,'..',asset), err=>{ if(err && !res.headersSent) next(err); });
});
// Backwards-compatible URLs for older page versions.
for (const asset of communityAssets) app.get('/'+asset, (req,res)=>res.redirect(302,'/community-assets/'+asset));
if (process.env.DATABASE_URL) await mountTelegramShop(app,pool);
app.use(express.static(path.join(__dirname,'../public')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'../public/index.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Interner Fehler'});});
const port=Number(process.env.PORT||3000);
const schema=await readFile(path.join(__dirname,'schema.sql'),'utf8');
if(process.env.DATABASE_URL) await pool.query(schema); else console.warn('DATABASE_URL missing: database features are disabled until configured.');
app.listen(port,()=>console.log(`ROTHSHILD platform listening on ${port}`));
