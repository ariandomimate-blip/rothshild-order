const form=document.getElementById('applicationForm');
const statusEl=document.getElementById('status');
const fallback=document.getElementById('mailtoFallback');
if(form){
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!form.reportValidity())return;
  const data=new FormData(form);
  const application={
   fullName:String(data.get('fullName')).trim(),
   email:String(data.get('email')).trim(),
   address:String(data.get('address')).trim(),
   goals:String(data.get('goals')).trim(),
   motivation:String(data.get('motivation')).trim()
  };
  const subject='Mitgliedschaftsantrag – '+application.fullName;
  const body=['Sehr geehrtes ROTHSHILD Order of Light Administrationsteam,','','hiermit reiche ich meinen Mitgliedschaftsantrag ein.','','Vollständiger Name: '+application.fullName,'E-Mail-Adresse: '+application.email,'Anschrift: '+application.address,'','Persönliche Ziele:',application.goals,'','Motivation:',application.motivation,'','Mit freundlichen Grüßen',application.fullName].join('\n');
  fallback.href='mailto:rothschildofficial938@gmail.com?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
  fallback.hidden=true;
  statusEl.textContent='Bewerbung wird an die Administration übermittelt …';
  const submit=form.querySelector('button[type="submit"]');
  submit.disabled=true;
  try{
   const response=await fetch('/api/applications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(application)});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.error||'E-Mail-Versand nicht verfügbar.');
   statusEl.textContent='✓ '+(result.message||'Deine Bewerbung wurde per E-Mail übermittelt.');
   form.reset();
  }catch(error){
   statusEl.textContent=(error.message||'Der Serverversand ist fehlgeschlagen.')+' Alternativ kannst du die Bewerbung über deine E-Mail-App senden:';
   fallback.hidden=false;
  }finally{submit.disabled=false;}
 });
}