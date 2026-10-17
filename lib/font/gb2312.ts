/** GB2312-1980 character data: codes, NOT drawn glyphs. */
export type GbScope = "level1" | "level2" | "hanzi" | "symbols" | "all" | "custom";
export type GbRecord = {char:string;gb:string;unicode:string;zone:number;position:number;type:"level1"|"level2"|"symbols"};
export type GbData = {level1:string;level2:string;hanzi:string;symbols:string;all:string;records:GbRecord[]};
export const GB_SCOPES: {key:GbScope;title:string;count:number}[] = [
 {key:"level1",title:"一级常用汉字",count:3755},
 {key:"level2",title:"二级汉字",count:3008},
 {key:"hanzi",title:"全部汉字",count:6763},
 {key:"symbols",title:"标准符号",count:682},
 {key:"all",title:"完整 GB2312",count:7445},
 {key:"custom",title:"自定义文字",count:0},
];
export function chosenCharacters(data:GbData,scope:GbScope,custom="") {
 return scope === "custom" ? Array.from(new Set(Array.from(custom).filter(c=>!/^\s$/.test(c)))).join("") : data[scope];
}
export function gbRecord(data:GbData,c:string){return data.records.find(r=>r.char===c);}
