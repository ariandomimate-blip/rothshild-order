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
import { fileURLToPath } from 'node:url';

const app=express(), {Pool}=pg;
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:true}:false});
const prod=process.env.NODE_ENV==='production';
if(!process.env.JWT_SECRET || process.env.JWT_SECRET.length<32) {
  console.warn('WARN: Set a unique JWT_SECRET of at least 32 characters before deployment.');
}
app.use(helmet({contentSecurityPolicy:{directives:{"default-src":["'self'"],"script-src":["'self'"],"style-src":["'self'"],"img-src":["'self'","data:"],"connect-src":["'self'"],"object-src":["'none'"],"frame-ancestors":["'none'"]}}}));
app.use(cors({origin:process.env.APP_ORIGIN,credentials:true}));
app.use(express.json({limit:'30kb'})); app.use(cookieParser());
app.use('/api/auth',rateLimit({windowMs:15*60*1000,limit:12,standardHeaders:true,legacyHeaders:false}));
const q=(s,v=[])=>pool.query(s,v);
const cookieOpts={httpOnly:true,secure:prod || process.env.COOKIE_SECURE==='true',sameSite:'strict',path:'/'};
function tokenFor(u){return jwt.sign({sub:u.id,role:u.role,status:u.status},process.env.JWT_SECRET,{expiresIn:'2h',issuer:'rothshild-platform'});}
async function auth(req,res,next){
 try{const t=req.cookies.session;if(!t)return res.status(401).json({error:'Anmeldung erforderlich'});const p=jwt.verify(t,process.env.JWT_SECRET,{issuer:'rothshild-platform'});const r=await q('SELECT id,email,display_name,role,status FROM users WHERE id=$1',[p.sub]);if(!r.rowCount)return res.status(401).json({error:'Konto nicht gefunden'});req.user=r.rows[0];next();}catch{return res.status(401).json({error:'Sitzung ungültig oder abgelaufen'});}
}
const roles=(...allowed)=>(req,res,next)=>allowed.includes(req.user.role)?next():res.status(403).json({error:'Keine Berechtigung'});
const approved=(req,res,next)=>req.user.status==='approved'?next():res.status(403).json({error:'Mitgliedschaft noch nicht freigeschaltet'});
const clean=(v,max=4000)=>String(v??'').trim().slice(0,max);
app.get('/api/health',(req,res)=>res.json({ok:true}));
app.post('/api/auth/register',async(req,res)=>{
 const email=clean(req.body.email,254).toLowerCase(), name=clean(req.body.displayName,70), password=String(req.body.password||'');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||name.length<2||password.length<12)return res.status(400).json({error:'Bitte gültige E-Mail, Anzeigename und Passwort mit mindestens 12 Zeichen angeben.'});
 try{const hash=await bcrypt.hash(password,12);await q('INSERT INTO users(email,display_name,password_hash) VALUES($1,$2,$3)',[email,name,hash]);res.status(201).json({message:'Antrag eingegangen. Freischaltung durch die Administration erforderlich.'});}
 catch(e){res.status(e.code==='23505'?409:500).json({error:e.code==='23505'?'E-Mail bereits registriert':'Registrierung derzeit nicht möglich'});}
});
app.post('/api/auth/login',async(req,res)=>{
 const email=clean(req.body.email,254).toLowerCase(), password=String(req.body.password||'');
 const r=await q('SELECT id,email,display_name,password_hash,role,status FROM users WHERE email=$1',[email]);
 if(!r.rowCount||!(await bcrypt.compare(password,r.rows[0].password_hash)))return res.status(401).json({error:'Anmeldedaten ungültig'});
 const u=r.rows[0];res.cookie('session',tokenFor(u),{...cookieOpts,maxAge:2*60*60*1000});
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
 const r=await q('INSERT INTO forum_posts(category_id,author_id,title,body) VALUES($1,$2,$3,$4) RETURNING id',[c.rows[0].id,req.user.id,title,body]);res.status(201).json({id:r.rows[0].id});
});
app.get('/api/library',auth,async(req,res)=>{const r=await q("SELECT id,title,topic,summary,body,source_note,visibility FROM library_items WHERE visibility='public' OR $1='approved' ORDER BY created_at DESC",[req.user.status]);res.json(r.rows);});
app.get('/api/admin/users',auth,roles('admin','moderator'),async(req,res)=>{const r=await q('SELECT id,email,display_name,role,status,created_at FROM users ORDER BY created_at DESC LIMIT 300');res.json(r.rows);});
app.patch('/api/admin/users/:id',auth,roles('admin'),async(req,res)=>{
 const status=['pending','approved','rejected','suspended'].includes(req.body.status)?req.body.status:null;
 const role=['applicant','member','mentor','moderator','admin'].includes(req.body.role)?req.body.role:null;
 if(!status&&!role)return res.status(400).json({error:'Keine gültige Änderung'});
 const r=await q('UPDATE users SET status=COALESCE($1,status),role=COALESCE($2,role) WHERE id=$3 RETURNING id,email,display_name,role,status',[status,role,req.params.id]);
 if(!r.rowCount)return res.status(404).json({error:'Mitglied nicht gefunden'});res.json(r.rows[0]);
});
app.post('/api/admin/mentor-assignments',auth,roles('admin'),async(req,res)=>{
 const member=clean(req.body.memberId,60),mentor=clean(req.body.mentorId,60);
 const m=await q("SELECT id FROM users WHERE id=$1 AND status='approved'",[member]),t=await q("SELECT id FROM users WHERE id=$1 AND role='mentor' AND status='approved'",[mentor]);
 if(!m.rowCount||!t.rowCount)return res.status(400).json({error:'Freigeschaltetes Mitglied und freigeschalteter Mentor erforderlich'});
 const r=await q('INSERT INTO mentor_assignments(member_id,mentor_id,assigned_by) VALUES($1,$2,$3) ON CONFLICT(member_id,mentor_id) DO UPDATE SET status=\\'invited\\' RETURNING id',[member,mentor,req.user.id]);res.status(201).json({assignmentId:r.rows[0].id,status:'invited'});
});
app.post('/api/mentor-assignments/:id/respond',auth,async(req,res)=>{
 const accept=req.body.accept===true;const r=await q('UPDATE mentor_assignments SET status=$1 WHERE id=$2 AND (member_id=$3 OR mentor_id=$3) AND status=\\'invited\\' RETURNING *',[accept?'accepted':'declined',req.params.id,req.user.id]);
 if(!r.rowCount)return res.status(404).json({error:'Einladung nicht gefunden'});res.json({status:r.rows[0].status});
});
app.get('/api/mentor-assignments',auth,async(req,res)=>{const r=await q('SELECT a.*,m.display_name AS member_name,t.display_name AS mentor_name FROM mentor_assignments a JOIN users m ON m.id=a.member_id JOIN users t ON t.id=a.mentor_id WHERE a.member_id=$1 OR a.mentor_id=$1 ORDER BY a.created_at DESC',[req.user.id]);res.json(r.rows);});
app.get('/api/conversations/:id/messages',auth,async(req,res)=>{
 const ok=await q('SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2',[req.params.id,req.user.id]);if(!ok.rowCount)return res.status(403).json({error:'Kein Zugriff'});
 const r=await q('SELECT id,sender_id,ciphertext,created_at FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC LIMIT 200',[req.params.id]);res.json(r.rows);
});
app.post('/api/conversations/:id/messages',auth,async(req,res)=>{
 const ok=await q('SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2',[req.params.id,req.user.id]);if(!ok.rowCount)return res.status(403).json({error:'Kein Zugriff'});
 const ciphertext=clean(req.body.ciphertext,12000);if(ciphertext.length<1)return res.status(400).json({error:'Nachricht fehlt'});
 const r=await q('INSERT INTO messages(conversation_id,sender_id,ciphertext) VALUES($1,$2,$3) RETURNING id,created_at',[req.params.id,req.user.id,ciphertext]);res.status(201).json(r.rows[0]);
});
app.use(express.static(path.join(__dirname,'../public')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'../public/index.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Interner Fehler'});});
const port=Number(process.env.PORT||3000);app.listen(port,()=>console.log(`ROTHSHILD platform listening on ${port}`));
