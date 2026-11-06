// Locate the reserved envelope without treating a bracket inside JSON as its end.
// Malformed or unfinished structured data consumes the remaining text, so no
// directive fragments escape into the narrative that memory consumers read.
export function statusRanges(input) {
    const text=String(input??''),ranges=[],startPattern=/\[STATUS\s*:/gi;
    let match;
    while((match=startPattern.exec(text))){
        const payloadStart=startPattern.lastIndex,stack=[];
        let quoted=false,escaped=false,end=text.length,complete=false;
        for(let i=payloadStart;i<text.length;i++){
            const char=text[i];
            if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
            if(char==='"'&&stack.length){quoted=true;continue;}
            if(char==='{'||char==='['){stack.push(char);continue;}
            if(char===']'&&!stack.length){end=i+1;complete=true;break;}
            if((char==='}'&&stack.at(-1)==='{')||(char===']'&&stack.at(-1)==='['))stack.pop();
        }
        ranges.push({start:match.index,end,complete,raw:text.slice(match.index,end),payload:text.slice(payloadStart,complete?end-1:end)});
        startPattern.lastIndex=end;
    }
    return ranges;
}
