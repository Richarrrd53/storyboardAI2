/** Project actions adapter. SurfaceMorph owns all geometry, animation and dismissal. */
(function(root) {
  'use strict';
  function engine() { if(!root.SurfaceMorph) throw new Error('Load SurfaceMorph before ProjectOptionMorph');return root.SurfaceMorph; }
  function open(trigger,project,card,options={},refreshCallback) {
    if(!trigger||!project) return;
    const opts=typeof options==='boolean'?{isHistoryPage:options,refreshCallback}:{...options};
    const isHistory=!!(opts.isHistoryPage||opts.isHistory||project.is_deleted);
    const menuContent=document.createElement('div');menuContent.className='project-actions-content';
    if (isHistory) {
      menuContent.innerHTML = `
        <button class="morph-item restore" type="button" data-action="restore">
          <span class="morph-item-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1 4 1 10 7 10"></polyline>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            </svg>
          </span>
          <span>還原分鏡</span>
        </button>
        <div class="morph-divider"></div>
        <button class="morph-item delete permanent-delete" type="button" data-action="permanentDelete">
          <span class="morph-item-icon">
            <svg data-im-icon="trash" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <g data-im-part="lid">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </g>
              <path data-im-part="body" d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
            </svg>
          </span>
          <span>永久刪除</span>
        </button>
      `;
    } else {
      menuContent.innerHTML = `
        <button class="morph-item rename" type="button" data-action="rename">
          <span class="morph-item-icon">
            <svg data-im-icon="pencil" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">

              <path data-im-part="body" d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
            </svg>
          </span>
          <span>重新命名</span>
        </button>
        <button class="morph-item tags" type="button" data-action="tags">
          <span class="morph-item-icon">
            <svg data-im-icon="tag" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <g data-im-part="body">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                <line x1="7" y1="7" x2="7.01" y2="7"></line>
              </g>
            </svg>
          </span>
          <span>編輯標籤</span>
        </button>
        <button class="morph-item duplicate" type="button" data-action="duplicate">
          <span class="morph-item-icon">
            <svg data-im-icon="copy" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path data-im-part="back" d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              <rect data-im-part="front" x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            </svg>
          </span>
          <span>複製分鏡</span>
        </button>
        <button class="morph-item export" type="button" data-action="export">
          <span class="morph-item-icon">
            <svg data-im-icon="download" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path data-im-part="tray" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <g data-im-part="arrow">
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </g>
            </svg>
          </span>
          <span>匯出 JSON</span>
        </button>
        <div class="morph-divider"></div>
        <button class="morph-item delete" type="button" data-action="delete">
          <span class="morph-item-icon">
            <svg data-im-icon="trash" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <g data-im-part="lid">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </g>
              <path data-im-part="body" d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
            </svg>
          </span>
          <span>刪除分鏡</span>
        </button>
      `;
    }

    const items=menuContent.querySelectorAll('.morph-item');
    const disposeHover=root.IconMotion?.bindHoverContainer?.(menuContent,{
      itemSelector:'.morph-item',
      canAnimate:()=>{
        const surface=menuContent.closest?.('.surface-morph-surface');
        return !surface||(surface.classList.contains('is-content-visible')&&!surface.inert);
      }
    });
    items.forEach(item=>{
      item.setAttribute('role','menuitem');
      item.addEventListener('click',event=>{
        event.stopPropagation?.();
        if(item.disabled) return;
        if(item.dataset?.imGesturePlayed==='true'){delete item.dataset.imGesturePlayed;}
        else{root.IconMotion?.play?.(item);}
        engine().close('action',()=>{
          const environment=typeof window!=='undefined'?window:root;
          const fallback=typeof global!=='undefined'?global:{};
          const actions=opts.projectActions||environment.ProjectActions||fallback.ProjectActions;
          const names={rename:'renameProject',tags:'editProjectTags',duplicate:'duplicateProject',export:'exportProject',delete:'deleteProject',restore:'restoreProject',permanentDelete:'permanentDeleteProject'};
          const name=names[item.dataset.action],action=actions?.[name]||environment[name]||fallback[name];
          const refresh=()=>{opts.refreshCallback?.();(environment.updateSidebarProjects||fallback.updateSidebarProjects)?.();};
          if(typeof action==='function') action(project,...(item.dataset.action==='export'?[]:[card,refresh]));
        });
      });
    });
    card?.classList?.add('is-menu-open','is-expanded');
    const iconSize=parseFloat(root.getComputedStyle?.(trigger)?.getPropertyValue?.('--folder-option-icon-size'))||15;
    const onClose=opts.onClose;
    return engine().open(trigger,{...opts,content:menuContent,width:opts.width||196,height:isHistory?112:256,placement:'below',align:opts.align??trigger.dataset?.morphAlign,label:'專案選單',
      triggerIconHTML:`<svg width="${iconSize}" height="${iconSize}" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="5" r="1.5"/><circle cx="8" cy="11" r="1.5"/></svg>`,
      onClose:reason=>{disposeHover?.();root.IconMotion?.cleanup?.(menuContent);card?.classList?.remove('is-menu-open');if(!card?.matches?.(':hover'))card?.classList?.remove('is-expanded');onClose?.(reason);}
    });
  }
  const api={open,openSurface:(trigger,opts)=>engine().open(trigger,opts),close:(...args)=>engine().close(...args),isOpen:()=>engine().isOpen(),destroy:()=>engine().destroy()};
  function bridge(target){target.ProjectOptionMorph=api;target.openGlobalOptionMorph=(trigger,project,card,isHistoryPage,refreshCallback)=>open(trigger,project,card,{isHistoryPage,refreshCallback});target.closeGlobalOptionMorph=done=>api.close(null,done);}
  bridge(root);if(typeof global!=='undefined'&&global!==root)bridge(global);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
