(()=>{'use strict';
const source='de',target='en';
const preference=document.cookie.split(';').find(x=>x.trim().startsWith('googtrans='));
const selectedLanguage=preference?.trim().split('/')[2]||'';
if(!preference||selectedLanguage==='de')document.cookie='googtrans=/'+source+'/'+target+';path=/;max-age=31536000;SameSite=Lax;Secure';
const blocked=['.goog-te-banner-frame','.goog-te-balloon-frame','.goog-te-ftab','.goog-te-menu-frame','#goog-gt-tt','.goog-tooltip','.VIpgJd-yAWNEb-L7lbkb','.VIpgJd-ZVi9od-aZ2wEe-wOHMyf'];
function clearOverlays(){document.querySelectorAll(blocked.join(',')).forEach(el=>{el.style.setProperty('display','none','important');el.style.setProperty('visibility','hidden','important');});document.querySelectorAll('.skiptranslate iframe,iframe.goog-te-menu-frame').forEach(el=>el.style.setProperty('display','none','important'));document.body.style.top='0px';}
window.googleTranslateElementInit=()=>{if(!window.google?.translate?.TranslateElement)return;new google.translate.TranslateElement({pageLanguage:source,includedLanguages:'en,de,fr,es,it,pt,ru,zh-CN,ja,ar,hi,tr,nl,pl,ko,sv,uk,el,he,th,vi',autoDisplay:false,layout:google.translate.TranslateElement.InlineLayout.SIMPLE},'google_translate_element');clearOverlays();};
const observer=new MutationObserver(clearOverlays);observer.observe(document.documentElement,{childList:true,subtree:true});
const s=document.createElement('script');s.src='https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';s.async=true;document.head.appendChild(s);
document.addEventListener('DOMContentLoaded',clearOverlays);
})();