const form=document.getElementById('applicationForm');
const fallback=document.getElementById('mailtoFallback');
if(form&&fallback){
 fallback.addEventListener('click',event=>{
  if(!form.reportValidity()){event.preventDefault();return;}
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
 });
}