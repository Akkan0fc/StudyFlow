(() => {
  const key='studyflow-theme', system=matchMedia('(prefers-color-scheme: dark)');
  let choice;try{choice=localStorage.getItem(key);}catch{}
  const valid=x=>x==='light'||x==='dark';
  function sync(){
    const dark=document.documentElement.dataset.theme==='dark';
    document.querySelectorAll('[data-action="toggle-theme"]').forEach(button=>{
      button.setAttribute('aria-label',`Switch to ${dark?'light':'dark'} mode`);button.setAttribute('aria-pressed',String(dark));button.title=`Switch to ${dark?'light':'dark'} mode`;
      button.innerHTML=`<span aria-hidden="true">${dark?'☀':'☾'}</span>`;
    });
  }
  function apply(value){document.documentElement.dataset.theme=value;document.documentElement.style.colorScheme=value;sync();}
  apply(valid(choice)?choice:system.matches?'dark':'light');
  document.addEventListener('click',event=>{if(!event.target.closest('[data-action="toggle-theme"]'))return;choice=document.documentElement.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem(key,choice);}catch{}apply(choice);});
  system.addEventListener('change',()=>{if(!valid(choice))apply(system.matches?'dark':'light');});
  window.addEventListener('storage',event=>{if(event.key===key){choice=event.newValue;apply(valid(choice)?choice:system.matches?'dark':'light');}});
  window.studyflowTheme={sync};
})();
