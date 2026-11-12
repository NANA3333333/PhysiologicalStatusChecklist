import { CASE_SETTINGS_KEY, CASE_FONTS, normalizeCaseSettings } from './case-protocol.js';
export function getCaseSettings(context){return normalizeCaseSettings(context.chatMetadata?.[CASE_SETTINGS_KEY]);}

export function createCaseSettingsButton(getContext,onSaved){
    const bar=document.createElement('div');bar.className='u4d-case-toolbar';
    const button=document.createElement('button');button.type='button';button.textContent='病例设置';button.className='u4d-case-settings-open';
    bar.append(button);
    let dialog;
    button.addEventListener('click',()=>{
        dialog?.remove();
        const context=getContext(),metadata=context.chatMetadata??={},scope=context.chatId;
        const settings=getCaseSettings(context);
        dialog=document.createElement('dialog');dialog.className='u4d-case-settings';dialog.setAttribute('aria-labelledby','u4d-case-settings-title');
        dialog.innerHTML=`<form>
            <header><div><small>当前聊天 · 病例与纸面</small><h2 id="u4d-case-settings-title">谁来写，写给谁</h2></div><button type="button" data-cancel aria-label="关闭病例设置">×</button></header>
            <div class="u4d-settings-pair"><label>记录者<input name="writer" maxlength="80" placeholder="例如：林医生；留空由 AI 根据上下文判断"></label><label>受检者<input name="patient" maxlength="80" placeholder="留空使用当前聊天角色"></label></div>
            <label>病例语言 / Case language<select name="language"><option value="zh">中文</option><option value="en">English</option></select></label>
            <label>书写要求<textarea name="instructions" maxlength="1200" rows="3" placeholder="例如：林医生为受伤的 Orion 记录病例。医生写字时手抖；仅在上下文合理时使用血迹、水渍，可将标记放在某句之后。"></textarea></label>
            <label class="u4d-setting-check"><input name="autoStyle" type="checkbox">由 AI 根据上下文选择字体、模糊、放大和歪斜</label>
            <p class="u4d-settings-hint">下面的书写参数用于未指定效果时；关闭 AI 选择后始终使用这些参数。固定表头一直使用印刷字体。</p>
            <label>默认手写字体<select name="font"></select></label>
            <div class="u4d-settings-ranges"></div>
            <fieldset><legend>允许 AI 使用的痕迹</legend><label class="u4d-setting-check"><input name="blood" type="checkbox">血迹</label><label class="u4d-setting-check"><input name="water" type="checkbox">水渍</label><label class="u4d-setting-check"><input name="corrections" type="checkbox">划掉与涂抹</label></fieldset>
            <p class="u4d-settings-hint">不同血迹、水渍可共存，同一种素材只出现一次。字体变化和涂抹可重复；AI 会用“字段＋原句＋前／后／覆盖”定位。</p>
            <p class="u4d-settings-hint">保存后随下一次正常回复生成病例，不额外调用模型。已生成的字段与标记只随聊天保存、折叠查看，不回填后续记忆或正文上下文。</p>
            <p class="u4d-settings-status" role="status"></p><footer><button type="button" data-cancel>取消</button><button type="submit">保存设置</button></footer>
        </form>`;
        const form=dialog.querySelector('form'),controls=form.elements;
        for(const [key,font]of Object.entries(CASE_FONTS))controls.font.add(new Option(font.label,key));
        for(const [key,label,min,max,step,unit]of [
            ['printScale','印刷字号',80,130,5,'%'],['fontSize','手写字号',11,18,.5,' px'],
            ['tilt','歪斜与起伏',0,100,5,'%'],['blur','局部模糊',0,100,5,'%'],['messiness','潦草程度',0,100,5,'%']
        ]){
            const labelNode=document.createElement('label');labelNode.className='u4d-setting-range';
            const title=document.createElement('span');title.textContent=label;
            const output=document.createElement('output'),range=document.createElement('input');
            range.type='range';range.name=key;range.min=min;range.max=max;range.step=step;range.value=settings[key];
            output.value=`${range.value}${unit}`;range.addEventListener('input',()=>output.value=`${range.value}${unit}`);
            labelNode.append(title,output,range);form.querySelector('.u4d-settings-ranges').append(labelNode);
        }
        for(const [key,value]of Object.entries(settings)){
            if(controls[key]?.type==='checkbox')controls[key].checked=value;
            else if(controls[key])controls[key].value=value;
        }
        controls.language.addEventListener('change',()=>{
            if(controls.language.value==='en'&&!CASE_FONTS[controls.font.value].latin)controls.font.value='kalam';
            if(controls.language.value==='zh'&&CASE_FONTS[controls.font.value].latin)controls.font.value='yozai';
        });
        if(settings.language==='en'){
            const labels={'当前聊天 · 病例与纸面':'CURRENT CHAT · CASE SETTINGS','谁来写，写给谁':'Who writes, for whom','记录者':'Writer','受检者':'Patient','书写要求':'Writing instructions','由 AI 根据上下文选择字体、模糊、放大和歪斜':'Let AI choose handwriting, blur, size and tilt from context','默认手写字体':'Default handwriting font','印刷字号':'Print size','手写字号':'Handwriting size','歪斜与起伏':'Tilt & baseline variation','局部模糊':'Patchy blur','潦草程度':'Messiness','允许 AI 使用的痕迹':'Allowed marks','血迹':'Blood','水渍':'Water','划掉与涂抹':'Cross-outs & scribbles','取消':'Cancel','保存设置':'Save settings'};
            const walker=document.createTreeWalker(dialog,NodeFilter.SHOW_TEXT);let node;
            while((node=walker.nextNode())){const key=node.nodeValue.trim();if(labels[key])node.nodeValue=node.nodeValue.replace(key,labels[key]);}
            controls.writer.placeholder='e.g. Dr. Lin; leave blank for AI to infer';controls.patient.placeholder='Leave blank for the current character';
            controls.instructions.placeholder='e.g. Dr. Lin records Orion’s condition with a trembling hand. Add marks only when supported by context.';
            dialog.querySelector('[aria-label]').setAttribute('aria-label','Close case settings');
            const hints=['These are defaults when AI omits a choice. Turn AI selection off to use them throughout. Fixed labels stay printed.','Different blood and water materials can coexist; each material appears once. Ink effects can repeat and anchor before, after or over an exact phrase.','Changes apply to the next normal reply, with no extra model call. Generated fields and marks stay folded with the chat and out of future narrative history and built-in memory.'];
            dialog.querySelectorAll('.u4d-settings-hint').forEach((n,i)=>n.textContent=hints[i]);
            for(const option of controls.font.options)option.textContent=({yozai:'Yozai · Chinese',wenkai:'LXGW WenKai · Chinese',xiaolai:'Xiaolai · Chinese',system:'System KaiTi',caveat:'Caveat · Loose notes',kalam:'Kalam · Clear handwriting',patrickhand:'Patrick Hand · Rounded'})[option.value];
        }
        dialog.querySelectorAll('[data-cancel]').forEach(n=>n.addEventListener('click',()=>dialog.close()));
        dialog.addEventListener('close',()=>{dialog.remove();button.focus();},{once:true});
        dialog.addEventListener('keydown',e=>{if(e.key==='Escape')e.stopPropagation();});
        form.addEventListener('submit',async event=>{
            event.preventDefault();
            const status=form.querySelector('[role=status]');
            const now=getContext();
            if(now.chatMetadata!==metadata||now.chatId!==scope){status.textContent=settings.language==='en'?'Chat changed. Close and reopen settings.':'聊天已切换，请关闭后重新打开设置。';return;}
            const values={};
            for(const key of Object.keys(settings))values[key]=controls[key].type==='checkbox'?controls[key].checked:controls[key].type==='range'?Number(controls[key].value):controls[key].value;
            const previous=metadata[CASE_SETTINGS_KEY];metadata[CASE_SETTINGS_KEY]=normalizeCaseSettings(values);
            const submit=form.querySelector('[type=submit]');submit.disabled=true;
            try{
                const save=now.saveMetadata??now.saveMetadataDebounced??now.saveChat??now.saveChatConditional;
                if(typeof save!=='function')throw new Error('No chat save API');
                await save.call(now);
                if(getContext().chatMetadata===metadata){onSaved();dialog.close();}
                else{status.textContent=settings.language==='en'?'Saved to the original chat. Close settings.':'已保存到原聊天，请关闭设置。';}
            }catch(error){
                if(previous===undefined)delete metadata[CASE_SETTINGS_KEY];else metadata[CASE_SETTINGS_KEY]=previous;
                status.textContent=settings.language==='en'?'Save failed. Check the chat connection and retry.':'保存失败，请检查聊天连接后重试。';console.warn('[PhysiologicalStatusChecklist] Case settings save failed',error);
            }finally{submit.disabled=false;}
        });
        document.body.append(dialog);dialog.showModal();
        // Opening settings on a phone should not summon the keyboard immediately.
        const touch=navigator.maxTouchPoints>0||window.matchMedia('(pointer:coarse)').matches;
        (touch?dialog.querySelector('header button'):controls.writer).focus({preventScroll:true});
        const fitKeyboard=()=>{
            if(!touch||!window.visualViewport)return;
            dialog.style.maxHeight=`${Math.max(120,window.visualViewport.height-32)}px`;
            dialog.style.top=`${window.visualViewport.offsetTop+16}px`;
            dialog.style.bottom='auto';dialog.style.margin='0 auto';
        };
        fitKeyboard();window.visualViewport?.addEventListener('resize',fitKeyboard);
        window.visualViewport?.addEventListener('scroll',fitKeyboard);
        dialog.addEventListener('close',()=>{
            window.visualViewport?.removeEventListener('resize',fitKeyboard);
            window.visualViewport?.removeEventListener('scroll',fitKeyboard);
        },{once:true});
    });
    return bar;
}
