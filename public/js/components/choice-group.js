/** Exclusive choices. Feature callbacks own values; this owner handles semantics and keyboard focus. */
(function(root){
  'use strict';
  const owners=new WeakMap();
  const options=group=>Array.from(group.querySelectorAll('[data-choice-option]'));
  const disabled=option=>option.disabled||option.getAttribute('aria-disabled')==='true'||!!option.closest?.('fieldset:disabled');
  function sync(group, selected) {
    if(!group)return;
    group.setAttribute('role','radiogroup');
    const items=options(group),entry=items.find(option=>option===selected&&!disabled(option)&&!option.hidden)||items.find(option=>!disabled(option)&&!option.hidden);
    for(const option of items){option.setAttribute('role','radio');option.setAttribute('aria-checked',String(option===selected));option.removeAttribute('aria-pressed');option.tabIndex=option===entry?0:-1;}
  }
  function mount(group,{signal}={}){
    if(!group||signal?.aborted)return {unmount(){}};
    owners.get(group)?.unmount();
    const keydown=event=>{
      if(event.altKey||event.ctrlKey||event.metaKey||!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
      const items=options(group).filter(option=>!disabled(option)&&!option.hidden),target=event.target.closest?.('[data-choice-option]'),index=items.indexOf(target);
      if(index<0||!items.length)return;
      const rtl=root.getComputedStyle?.(group)?.direction==='rtl';
      const forward=event.key==='ArrowDown'||event.key===(rtl?'ArrowLeft':'ArrowRight');
      const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(forward?1:-1)+items.length)%items.length;
      event.preventDefault();items[next].focus({preventScroll:true});items[next].click();
    };
    group.addEventListener('keydown',keydown);
    let disposed=false;
    const owner={unmount(){if(disposed)return;disposed=true;group.removeEventListener('keydown',keydown);signal?.removeEventListener('abort',owner.unmount);if(owners.get(group)===owner)owners.delete(group);}};
    owners.set(group,owner);signal?.addEventListener('abort',owner.unmount,{once:true});
    sync(group,options(group).find(option=>option.getAttribute('aria-checked')==='true'||option.getAttribute('aria-pressed')==='true'));
    return owner;
  }
  root.ChoiceGroup={mount,sync};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.ChoiceGroup;
})(typeof window!=='undefined'?window:globalThis);
