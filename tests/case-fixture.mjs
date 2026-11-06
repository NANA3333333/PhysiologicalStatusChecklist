export function caseFixture({writer='林医生',patient='Orion',allStains=false,duplicates=false,long=false,font='yozai'}={}) {
    const notes='触碰后左手短暂回缩。左前臂轻微发抖。继续观察。'+(long?'后续观察仍需逐项记录。'.repeat(45):'');
    const fields=['日期=第3天·夜','成长周期=幼体·阶段2','形态=人形拟态','身体=清醒，肢端偏冷','体温=偏低','呼吸=平稳','循环=稳定','精神=警觉','损伤=左前臂浅表擦伤，无持续出血',`观察补记=${notes}`,'处置=轻柔清洁后覆盖敷料。避免反复触碰。'];
    const mark=(key,value)=>fields.push(`${key}=${JSON.stringify(value)}`);
    fields.push(`记录者=${writer}`,`受检者=${patient}`);
    mark('书写',{font,size:15,tilt:.55,blur:.08,messiness:.35});
    for(const effect of [
        {type:'blur',quote:'轻微发抖',amount:.35}, {type:'blur',quote:'轻微发抖',amount:.25},
        {type:'enlarge',quote:'左前臂',scale:1.4},{type:'tilt',quote:'左前臂',angle:-14},
        {type:'font',quote:'继续观察',font:'xiaolai'}, {type:'scribble',quote:'短暂回缩',amount:.7},
    ])mark('笔迹',{field:'observationNote',occurrence:1,...effect});
    mark('笔迹',{field:'care',quote:'避免反复触碰',type:'strike',amount:.6});
    const blood=allStains?['drops','grip','smear','flow','wipe','soak']:['drops','grip'];
    const water=allStains?['rain','spill','edge']:['rain'];
    for(const [i,variant]of blood.entries())mark('血迹',{field:i%2?'injury':'observationNote',quote:i%2?'左前臂浅表擦伤':'继续观察。',variant,position:'after',size:55+i*4,opacity:.55,dx:i*10,dy:i*8});
    for(const [i,variant]of water.entries())mark('水渍',{field:'care',quote:'轻柔清洁后覆盖敷料。',variant,position:i?'after':'over',size:100+i*15,opacity:.5,dx:i*15,dy:i*10});
    if(duplicates){mark('血迹',{field:'care',quote:'覆盖敷料',variant:'drops'});mark('水渍',{field:'care',quote:'覆盖敷料',variant:'rain'});}
    return `${writer}检查了${patient}的左前臂，轻柔清洁擦伤后，嘱咐继续观察。\n[STATUS: ${fields.join(' | ')}]`;
}

export function englishCaseFixture({writer='Dr. Lin',patient='Orion',font='kalam'}={}){
    const fields=[`writer=${writer}`,`patient=${patient}`,'date=Day 3, evening','growth=Juvenile, stage 2','form=Humanoid',
        'body=Awake, cool extremities','temperature=Low','breathing=Steady','circulation=Stable','mental=Alert','pain=Mild',
        'injury=Superficial abrasion on the left forearm; no active bleeding.',
        'observationNote=Brief withdrawal on touch. A slight tremor in the left forearm. Continue observation.',
        'care=Clean gently. Cover with a dressing. Avoid repeated contact.'];
    const add=(key,obj)=>fields.push(`${key}=${JSON.stringify(obj)}`);
    add('writing',{font,size:16,tilt:.4,blur:.05,messiness:.2});
    for(const effect of [{type:'blur',quote:'slight tremor',amount:.3},{type:'blur',quote:'slight tremor',amount:.2},
        {type:'enlarge',quote:'left forearm',scale:1.25},{type:'tilt',quote:'left forearm',angle:-7},{type:'scribble',quote:'Brief withdrawal',amount:.5}])add('ink',{field:'observationNote',...effect});
    add('ink',{field:'care',quote:'Avoid repeated contact',type:'strike',amount:.6});
    add('blood',{field:'observationNote',quote:'Continue observation.',variant:'drops',position:'after',size:55,opacity:.55});
    add('blood',{field:'injury',quote:'left forearm',variant:'grip',position:'after',size:60,opacity:.5});
    add('water',{field:'care',quote:'Cover with a dressing.',variant:'rain',position:'over',size:100,opacity:.45});
    return `${writer} examined ${patient}'s forearm, cleaned the abrasion and advised continued observation.\n[STATUS: ${fields.join(' | ')}]`;
}
