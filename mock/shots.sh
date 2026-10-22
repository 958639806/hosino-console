S(){ node --experimental-websocket shoot.mjs "$@" 2>&1 | tail -1; }; B=http://localhost:18990/#
for p in approvals tools audit files; do S v2-$p-mobile-dark $B/$p 390 1500 dark; S v2-$p-desktop-light $B/$p 1440 1000 light; done
S v2-models-cost-mobile-dark $B/models 390 2600 dark "window.scrollTo(0, 1e5)"
S v2-models-cost-desktop-light $B/models 1440 1000 light "document.querySelector('#cost').scrollIntoView()"
S v2-probe-loading-mobile-dark $B/models 390 900 dark "document.querySelector('#auth').scrollIntoView(); document.querySelector('[data-probe]').click(); await new Promise(r=>setTimeout(r,3000))"
S v2-file-editor-mobile-dark "$B/files/SOUL.md" 390 844 dark
S v2-file-editor-desktop-light "$B/files/SOUL.md" 1440 1000 light "document.querySelector('[data-m=view]').click()"
S v2-chat-markdown-mobile-dark "$B/sessions/agent%3Amain%3Aqqbot%3Agroup%3A249BDB7019C96343C96EEBA8CB63D8C5" 390 1100 dark
S v2-chat-markdown-desktop-light "$B/sessions/agent%3Amain%3Aqqbot%3Agroup%3A249BDB7019C96343C96EEBA8CB63D8C5" 1440 1000 light
S v2-cron-sheet-mobile-dark $B/cron 390 1000 dark "document.querySelector('[data-job=hb]').click()"
S v2-cron-edit-desktop-light $B/cron 1440 1000 light "document.querySelector('[data-x=newcron]').click()"
S v2-search-mobile-dark $B/overview 390 844 dark "document.querySelector('.main [data-act=search]').click(); await new Promise(r=>setTimeout(r,900)); const q=document.querySelector('#gq'); q.value='qq'; q.dispatchEvent(new Event('input'))"
S v2-search-desktop-light $B/overview 1440 1000 light "document.querySelector('.main [data-act=search]').click(); await new Promise(r=>setTimeout(r,900)); const q=document.querySelector('#gq'); q.value='weather'; q.dispatchEvent(new Event('input'))"
S v2-delete-confirm-mobile-dark "$B/sessions/agent%3Amain%3Amain" 390 844 dark "document.querySelector('[data-x=tune]').click(); await new Promise(r=>setTimeout(r,600)); document.querySelector('[data-op=delete]').click(); await new Promise(r=>setTimeout(r,600)); document.querySelector('[data-yes]').click()"
S v2-skill-sheet-desktop-light $B/plugins 1440 1000 light "document.querySelector('[data-tab=skills]').click(); document.querySelector('[data-skill]').click()"
S v2-skill-sheet-mobile-dark $B/plugins 390 844 dark "document.querySelector('[data-tab=skills]').click(); document.querySelector('[data-skill=github]').click()"
S v2-totop-mobile-dark $B/logs 390 844 dark "window.scrollTo(0,1e5)"

C="$B/sessions/agent%3Amain%3Aqqbot%3Agroup%3A249BDB7019C96343C96EEBA8CB63D8C5"
S v21-media-mobile-dark "$C" 390 844 dark "const m=document.querySelector('#msgs'); m.scrollTop=0"
S v21-lightbox-mobile-dark "$C" 390 844 dark "document.querySelector('#msgs').scrollTop=0; document.querySelector('[data-full]').click()"
S v21-botmode-mobile-dark "$C" 390 844 dark "const a=document.querySelector('#asbot'); a.checked=true; a.onchange(); document.querySelector('#comp textarea').value='大家晚上好，读书会改到周六啦～'"
S v21-botmode-confirm-desktop-light "$C" 1440 1000 light "const a=document.querySelector('#asbot'); a.checked=true; a.onchange(); document.querySelector('#comp textarea').value='大家晚上好，读书会改到周六啦～'; document.querySelector('#comp').requestSubmit()"
S v21-botmode-confirm-mobile-dark "$C" 390 844 dark "const a=document.querySelector('#asbot'); a.checked=true; a.onchange(); document.querySelector('#comp textarea').value='大家晚上好，读书会改到周六啦～'; document.querySelector('#comp').requestSubmit()"

S(){ node --experimental-websocket shoot.mjs "$@" 2>&1 | tail -1; }; B=http://localhost:18990/#; C="$B/sessions/agent%3Amain%3Aqqbot%3Agroup%3A249BDB7019C96343C96EEBA8CB63D8C5"
S v21-sessions-alias-mobile-dark "$B/sessions" 390 844 dark
S v21-rename-desktop-light "$C" 1440 1000 light "document.querySelector('.chathead [data-rename]').click()"
S v21-media-mobile-dark "$C" 390 844 dark "const m=document.querySelector('#msgs'); m.scrollTop=0"
S v21-lightbox-mobile-dark "$C" 390 844 dark "document.querySelector('#msgs').scrollTop=0; document.querySelector('[data-full]').click()"
S v21-botmode-mobile-dark "$C" 390 844 dark "await new Promise(r=>setTimeout(r,500)); const a=document.querySelector('#asbot'); a.checked=true; a.onchange(); document.querySelector('#comp textarea').value='大家晚上好，读书会改到周六啦～'"
S v21-botmode-confirm-group-mobile-dark "$C" 390 844 dark "await new Promise(r=>setTimeout(r,500)); const a=document.querySelector('#asbot'); a.checked=true; a.onchange(); document.querySelector('#comp textarea').value='大家晚上好，读书会改到周六啦～'; document.querySelector('#comp').requestSubmit()"
S v21-botmode-confirm-main-desktop-light "$B/sessions/agent%3Amain%3Amain" 1440 1000 light "await new Promise(r=>setTimeout(r,500)); const a=document.querySelector('#asbot'); a.checked=true; a.onchange(); document.querySelector('#comp textarea').value='提醒：明早九点开会'; document.querySelector('#comp').requestSubmit()"
S v21-search-alias-mobile-dark "$B/overview" 390 844 dark "document.querySelector('.main [data-act=search]').click(); await new Promise(r=>setTimeout(r,1200)); const q=document.querySelector('#gq'); q.value='春'; q.dispatchEvent(new Event('input'))"
echo ALLDONE
