const form=document.getElementById('applicationForm');
const fallback=document.getElementById('mailtoFallback');
if(form&&fallback){
 fallback.addEventListener('click',event=>{
  if(!form.reportValidity()){event.preventDefault();return;}
  const data=new FormData(form);
  const application={fullName:String(data.get('fullName')).trim(),email:String(data.get('email')).trim(),address:String(data.get('address')).trim(),goals:String(data.get('goals')).trim(),motivation:String(data.get('motivation')).trim()};
  const subject='Membership application – '+application.fullName;
  const body=['Dear ROTHSHILD Order of Light Administration Team,','','I would like to submit my membership application.','','Full name: '+application.fullName,'Email address: '+application.email,'Address: '+application.address,'','Personal goals:',application.goals,'','Motivation:',application.motivation,'','Kind regards,',application.fullName].join('\n');
  fallback.href='mailto:rothschildofficial938@gmail.com?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
 });
}