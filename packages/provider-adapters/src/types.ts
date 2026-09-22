export interface ProviderResult<T>{providerId:string;model:string;value:T;usage?:{input:number;output:number}}
export interface Provider<T,I=unknown>{id:string;run(input:I,signal:AbortSignal):Promise<ProviderResult<T>>}
export interface ProviderPolicy{timeoutMs:number;retries:1|2|3;fallbackProviderIds:string[]}
export interface SpeechRecognizer extends Provider<{text:string;segments:Array<{startMs:number;endMs:number;text:string}>},{audioUrl:string;language:"auto"|"zh"|"en"}>{}
export interface Translator extends Provider<string,{text:string;context?:string;glossary?:Record<string,string>}>{}
export interface RoleAnalyzer extends Provider<Array<{segmentId:string;role:string}>,{segments:Array<{id:string;text:string}>}>{}
export interface VoiceGenerator extends Provider<{audioUrl:string;durationMs:number},{text:string;voice:string}>{}
