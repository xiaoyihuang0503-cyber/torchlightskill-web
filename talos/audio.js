const STORAGE_KEY='ss14-prison-audio-v1';
const DEFAULTS=Object.freeze({enabled:true,sfx:true,voice:true,ambience:true,music:true,volume:.65,musicVolume:.8});
// New music is loudness-normalized, with .35 clip gain: the existing 2.8 bus
// reaches at most .98 even when both saved volume sliders are at 100%.
const MUSIC_MIX=Object.freeze({gain:2.8,voiceDuck:.22,devourDuck:.34});
export const musicTracks=Object.freeze([
  Object.freeze({id:'music_abyss',title:'掌控深渊'}),
  Object.freeze({id:'music_twenty_days',title:'二十日囚徒'}),
  Object.freeze({id:'music_warden_silence',title:'The Warden’s Silence'}),
  Object.freeze({id:'music_keys_cage',title:'Keys to the Cage'})
]);
const MUSIC_IDS=new Set(musicTracks.map(track=>track.id));
const KINDS=new Set(['sfx','voice','ambience','music']);
const BEASTS=Object.freeze({elephant:'beast_elephant',lion:'beast_lion',wolf:'beast_wolf',rat:'beast_rat'});
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
function browserStorage(){try{return globalThis.localStorage;}catch{return null;}}
function preferences(value={}){
  const result={...DEFAULTS};
  for(const key of ['enabled','sfx','voice','ambience','music'])if(typeof value[key]==='boolean')result[key]=value[key];
  // A stored old default may also be a manual choice: retain every saved value.
  for(const key of ['volume','musicVolume'])if(Number.isFinite(value[key]))result[key]=clamp(value[key]);
  return result;
}

// Local media only. Playback is independent of the simulation and never awaited by it.
export class PrisonAudio {
  constructor({manifestUrl='assets/audio/manifest.json',baseUrl=new URL('./',import.meta.url).href,
    fetcher=globalThis.fetch?.bind(globalThis),audioFactory=()=>new Audio(),
    storage=browserStorage(),page=globalThis.document,onStatus=()=>{},maxEffects=6,random=Math.random}={}){
    this.baseUrl=new URL(baseUrl);this.manifestUrl=new URL(manifestUrl,this.baseUrl);
    this.fetcher=fetcher;this.audioFactory=audioFactory;this.storage=storage;this.page=page;this.onStatus=onStatus;
    this.maxEffects=Number.isFinite(maxEffects)?Math.max(1,Math.floor(maxEffects)):6;
    this.musicRandom=typeof random==='function'?random:Math.random;
    this.musicSelection='random';this.currentMusicId=null;
    this.clips=new Map();this.failed=new Set();this.effects=[];this.currentVoice=null;this.ambient=null;this.music=null;this.transientGeneration=0;
    this.unlocked=false;this.loaded=false;this.hidden=Boolean(page?.hidden);this.destroyed=false;
    this.preferences={...DEFAULTS};
    try{
      const saved=JSON.parse(storage?.getItem(STORAGE_KEY)||'{}');
      this.preferences=preferences(saved);
      if(MUSIC_IDS.has(saved.musicTrack))this.musicSelection=saved.musicTrack;
    }catch{}
    this.visibilityHandler=()=>this._visibility();
    this.pageHideHandler=()=>{this.hidden=true;this._suspend();};
    this.pageShowHandler=()=>this._visibility();
    page?.addEventListener?.('visibilitychange',this.visibilityHandler);
    page?.defaultView?.addEventListener?.('pagehide',this.pageHideHandler);
    page?.defaultView?.addEventListener?.('pageshow',this.pageShowHandler);
    this.ready=this._loadManifest();
  }
  async _loadManifest(){
    try{
      const response=await this.fetcher?.(this.manifestUrl.href,{cache:'no-cache'});
      if(!response?.ok)throw new Error('missing');
      const manifest=await response.json();
      if(!manifest||typeof manifest.clips!=='object'||!manifest.clips)throw new Error('invalid');
      const directory=new URL('./',this.manifestUrl);
      for(const [id,clip] of Object.entries(manifest.clips)){
        if(!clip||!KINDS.has(clip.kind)||typeof clip.path!=='string')continue;
        // Only the four user-provided replacements may enter the music player.
        // Old manifests cannot silently restore the retired generated loop.
        if(clip.kind==='music'&&!MUSIC_IDS.has(id))continue;
        let url;
        try{url=new URL(clip.path,/^(?:\.\/)?assets\//.test(clip.path)?this.baseUrl:directory);}catch{continue;}
        if(url.origin!==this.baseUrl.origin||!url.pathname.startsWith(directory.pathname)||!url.pathname.toLowerCase().endsWith('.mp3')||url.search||url.hash)continue;
        // Changed voice recordings retain their filenames; the manifest revision
        // gives browsers a fresh media URL without changing any local save data.
        if(clip.kind==='voice'&&Number.isSafeInteger(manifest.version)&&manifest.version>=3)url.searchParams.set('v',String(manifest.version));
        this.clips.set(id,{id,kind:clip.kind,url:url.href,gain:Number.isFinite(clip.gain)?clamp(clip.gain):1});
      }
    }catch{}
    this.loaded=true;
    if(!this.destroyed)this._syncLoops();
    this._notify();return this.getStatus();
  }
  unlock(event){
    if(this.destroyed||event?.isTrusted!==true||!['pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','click','keydown'].includes(event.type))return false;
    this.unlocked=true;this._syncLoops();this._notify();return true;
  }
  _allowed(kind){return !this.destroyed&&this.unlocked&&!this.hidden&&this.preferences.enabled&&this.preferences[kind];}
  _clip(id,kind){const clip=this.clips.get(id);return clip&&clip.kind===kind&&!this.failed.has(id)?clip:null;}
  _record(clip,priority=0){
    try{
      const media=this.audioFactory();media.src=clip.url;media.preload='auto';media.loop=clip.kind==='ambience'||clip.kind==='music';
      if(media.nodeType===1){media.hidden=true;media.dataset.prisonAudio=clip.id;this.page?.body?.append?.(media);}
      const record={id:clip.id,kind:clip.kind,gain:clip.gain,media,priority,playing:false,playSequence:0};
      this._volume(record);return record;
    }catch{this.failed.add(clip.id);return null;}
  }
  _volume(record){
    const voice=Boolean(this.currentVoice?.playing),devour=this.effects.some(effect=>effect.playing&&(effect.id==='devour'||effect.id.startsWith('beast_')));
    const duck=record.kind==='music'?(voice ? MUSIC_MIX.voiceDuck:devour ? MUSIC_MIX.devourDuck:1):record.kind==='ambience'&&voice ? .38:1;
    const level=record.kind==='music'?this.preferences.musicVolume:1;
    const mixGain=record.kind==='music'?MUSIC_MIX.gain:1;
    try{record.media.volume=clamp(this.preferences.volume*level*record.gain*mixGain*duck);}catch{}
  }
  _start(record,done){
    const sequence=++record.playSequence;
    let finished=false;
    const finish=failed=>{
      if(finished||record.playSequence!==sequence)return;
      finished=true;
      if(failed)this.failed.add(record.id);
      this._pause(record,true);done(failed);this._notify();
    };
    const rejected=error=>{
      if(record.playSequence!==sequence)return;
      const blocked=error?.name==='NotAllowedError';
      if(blocked)this.unlocked=false;
      finish(!blocked&&error?.name!=='AbortError');
      if(blocked)this._suspend();
    };
    record.media.onended=()=>finish(false);record.media.onerror=()=>finish(true);
    try{
      record.playing=true;const result=record.media.play();
      if(result?.catch)result.catch(rejected);
    }catch(error){rejected(error);return false;}
    this._notify();return true;
  }
  _pause(record,reset=false){
    if(!record)return;
    record.playSequence++;
    record.playing=false;
    try{record.media.pause();if(reset)record.media.currentTime=0;}catch{}
    if(reset){record.media.onended=null;record.media.onerror=null;}
    if(reset)record.media.remove?.();
  }
  play(id,{fallback=null}={}){
    const clip=this.clips.get(id);
    if(clip?.kind==='voice')return this.voice(id);
    if(clip?.kind==='ambience'){this._syncAmbient(id);return Boolean(this.ambient?.playing);}
    if(clip?.kind==='music'){this.setMusicTrack(id);return Boolean(this.music?.playing);}
    if(!this._allowed('sfx')||!this._clip(id,'sfx'))return false;
    while(this.effects.length>=this.maxEffects)this._pause(this.effects.shift(),true);
    const record=this._record(clip);if(!record)return fallback&&fallback!==id?this.play(fallback):false;
    this.effects.push(record);
    const generation=this.transientGeneration;
    const started=this._start(record,failed=>{
      this.effects=this.effects.filter(item=>item!==record);
      if(failed&&fallback&&fallback!==id&&generation===this.transientGeneration)this.play(fallback);
      this._syncVolumes();
    });
    this._syncVolumes();return started;
  }
  voice(id,{priority=0,replace=true}={}){
    if(!this._allowed('voice')||!this._clip(id,'voice'))return false;
    priority=Number.isFinite(priority)?clamp(priority,0,10):0;
    if(this.currentVoice?.id===id)return false;
    if(this.currentVoice&&(replace||priority>this.currentVoice.priority)){
      this._pause(this.currentVoice,true);this.currentVoice=null;
    }
    if(this.currentVoice)return false;
    return this._startVoice(id,priority);
  }
  _startVoice(id,priority){
    const clip=this._clip(id,'voice');if(!clip||!this._allowed('voice'))return false;
    const record=this._record(clip,priority);if(!record)return false;
    this.currentVoice=record;
    const started=this._start(record,()=>{
      if(this.currentVoice!==record)return;
      this.currentVoice=null;this._syncVolumes();
    });
    this._syncVolumes();return started;
  }
  _syncAmbient(id='ambience'){this._syncLoop('ambient','ambience',id);}
  _musicChoices(exclude=null){return musicTracks.filter(track=>track.id!==exclude&&this._clip(track.id,'music'));}
  _randomMusic(exclude=null){
    const choices=this._musicChoices(exclude);if(!choices.length)return null;
    let value;try{value=Number(this.musicRandom());}catch{value=0;}
    const index=Math.floor(clamp(Number.isFinite(value)?value:0,0,1-Number.EPSILON)*choices.length);
    return choices[index].id;
  }
  _chooseMusic({exclude=null}={}){
    if(this.musicSelection!=='random'){this.currentMusicId=this.musicSelection;return;}
    this.currentMusicId=this._randomMusic(exclude);
  }
  _syncMusic(){
    if(!this.loaded)return;
    if(!this.currentMusicId||(this.musicSelection==='random'&&!this._clip(this.currentMusicId,'music')))this._chooseMusic();
    this._syncLoop('music','music',this.currentMusicId);
    if(this.musicSelection==='random'&&this.currentMusicId&&this.failed.has(this.currentMusicId)&&this._allowed('music'))this._syncMusic();
  }
  _savePreferences(){
    try{this.storage?.setItem(STORAGE_KEY,JSON.stringify({...this.preferences,musicTrack:this.musicSelection}));}catch{}
  }
  setMusicTrack(selection='random'){
    if(this.destroyed||selection!=='random'&&!MUSIC_IDS.has(selection))return false;
    if(selection==='random')return this.refreshMusic();
    if(this.loaded&&!this._clip(selection,'music'))return false;
    this.musicSelection=selection;this.currentMusicId=selection;
    this._savePreferences();this._syncMusic();this._notify();return true;
  }
  refreshMusic(){
    if(this.destroyed)return false;
    const previous=this.currentMusicId;
    const next=this.loaded?this._randomMusic(previous):null;
    if(this.loaded&&!next)return false;
    this.musicSelection='random';this.currentMusicId=next;
    this._savePreferences();this._syncMusic();this._notify();return true;
  }
  enterMusic(){
    if(this.destroyed)return false;
    // Only explicit entry into a run rerolls random music. Reset, import,
    // undo and ordinary preference changes keep the same track selection.
    this._chooseMusic();this._syncMusic();this._notify();return Boolean(this.currentMusicId);
  }
  _syncLoops(){this._syncAmbient();this._syncMusic();}
  _syncLoop(slot,kind,id){
    if(!this._allowed(kind)){this._pause(this[slot]);return;}
    if(this[slot]?.id!==id){this._pause(this[slot],true);this[slot]=null;}
    if(!this[slot]){const clip=this._clip(id,kind);if(!clip)return;this[slot]=this._record(clip);}
    const record=this[slot];
    if(!record||record.playing)return;
    this._volume(record);
    this._start(record,failed=>{
      if(this[slot]!==record)return;
      this[slot]=null;
      if(failed&&kind==='music'&&this.musicSelection==='random'&&this._allowed('music'))this._syncMusic();
    });
  }
  _syncVolumes(){for(const record of [...this.effects,this.currentVoice,this.ambient,this.music].filter(Boolean))this._volume(record);}
  _suspend(){
    this.transientGeneration++;
    this.effects.forEach(record=>this._pause(record,true));this.effects=[];
    this._pause(this.currentVoice,true);this.currentVoice=null;
    this._pause(this.ambient);this._pause(this.music);this._syncVolumes();this._notify();
  }
  _visibility(){
    this.hidden=Boolean(this.page?.hidden);
    if(this.hidden)this._suspend();else this._syncLoops();
    this._syncVolumes();this._notify();
  }
  setPreferences(value={}){
    const previous=this.preferences;
    this.preferences=preferences({...this.preferences,...value});
    this._savePreferences();
    if(['enabled','sfx','voice'].some(kind=>previous[kind]&&!this.preferences[kind]))this.transientGeneration++;
    if(!this.preferences.enabled||!this.preferences.sfx)this.stop('sfx');
    if(!this.preferences.enabled||!this.preferences.voice)this.stop('voice');
    if(!this.preferences.enabled||!this.preferences.ambience)this._pause(this.ambient);
    if(!this.preferences.enabled||!this.preferences.music)this._pause(this.music);
    this._syncVolumes();this._syncLoops();this._notify();return {...this.preferences};
  }
  stop(kind='all'){
    if(kind==='all')this.transientGeneration++;
    if(kind==='all'||kind==='sfx'){this.effects.forEach(record=>this._pause(record,true));this.effects=[];}
    if(kind==='all'||kind==='voice'){this._pause(this.currentVoice,true);this.currentVoice=null;}
    if(kind==='all'||kind==='ambience'){this._pause(this.ambient,true);this.ambient=null;}
    if(kind==='all'||kind==='music'){this._pause(this.music,true);this.music=null;}
    this._syncVolumes();this._notify();
  }
  reset(){this.stop();this._syncLoops();}
  preview(kind='sfx'){
    if(kind==='voice')return this.voice('voice_patrol',{priority:10,replace:true});
    if(kind==='ambience'){this._syncAmbient();return Boolean(this.ambient?.playing);}
    if(kind==='music'){this._syncMusic();return Boolean(this.music?.playing);}
    return this.play('select');
  }
  devour(code){
    const beast=BEASTS[code];
    return beast&&this._clip(beast,'sfx')?this.play(beast,{fallback:'devour'}):this.play('devour');
  }
  actionStart(action){
    if(!action)return null;
    this._syncLoops();this.play('confirm');
    return {generation:this.transientGeneration,devourHandled:false,gatesHandled:false,completed:false};
  }
  _currentAction(token){return !token||token.generation===this.transientGeneration&&!token.completed;}
  gateReveal(action,before,after,token){
    if(!this._currentAction(token)||!before||!after||after.stats.opened<=before.stats.opened||token?.gatesHandled)return false;
    if(token)token.gatesHandled=true;
    this.play('gate');
    const oldIds=new Set([...before.rooms.map(room=>room.prisoner).filter(Boolean),...before.rainbow].map(p=>p.id));
    const newRooms=after.rooms.filter(room=>room.prisoner&&!oldIds.has(room.prisoner.id));
    // Main door first; extra simultaneous doors call each distinct beast once.
    // Read the resolved prisoners, never the unopened room's predicted contents.
    newRooms.sort((a,b)=>Number(b.id===action?.room)-Number(a.id===action?.room));
    const codes=new Set([...newRooms.map(room=>room.prisoner.code),...after.rainbow.filter(p=>!oldIds.has(p.id)).map(p=>p.code)]);
    for(const code of codes){const beast=BEASTS[code];if(beast&&this._clip(beast,'sfx'))this.play(beast);}
    return true;
  }
  actionImpact(action,before,after,token){
    if(action?.type==='visit')return this.gateReveal(action,before,after,token);
    if(!this._currentAction(token)||action?.type!=='eat'||!before||!after||after.stats.eaten<=before.stats.eaten||token?.devourHandled)return false;
    if(token)token.devourHandled=true;
    return this.devour(before.rooms[action.room]?.prisoner?.code);
  }
  actionComplete(action,before,after,token){
    if(!action||!before||!after||!this._currentAction(token))return;
    this.gateReveal(action,before,after,token);
    if(token)token.completed=true;
    const population=s=>[...s.rooms.map(room=>room.prisoner).filter(Boolean),...s.rainbow];
    const oldById=new Map(population(before).map(p=>[p.id,p.tier]));
    const rainbowIds=new Set(before.rainbow.map(p=>p.id));
    const rainbow=after.rainbow.some(p=>!rainbowIds.has(p.id));
    const upgraded=population(after).some(p=>oldById.has(p.id)&&p.tier>oldById.get(p.id));
    const goal=after.goalIndex>before.goalIndex;
    const day=after.day>before.day,enterRiot=after.phase==='riot'&&before.phase!=='riot',finished=after.phase==='finished'&&before.phase!=='finished';
    const handoff=enterRiot&&['public-preview-v1','public-preview-v2'].includes(after.reference?.version),riot=enterRiot&&!handoff;
    if(after.stats.eaten>before.stats.eaten&&!token?.devourHandled){
      if(action.type==='eat')this.devour(before.rooms[action.room]?.prisoner?.code);else this.play('devour');
    }
    if(upgraded)this.play('upgrade');
    if(action.type==='reroll'&&after.stats.swaps>before.stats.swaps)this.play('reroll');
    if(action.type==='choose'||action.type==='deliver')this.play('reward');
    if(day)this.play('day');
    if(riot)this.play('riot');
    const result=finished||handoff?['voice_end',6]:rainbow?['voice_rainbow',5]:goal?['voice_goal',4]:riot?['voice_riot',4]:action.type==='choose'?['voice_reward',3]:day?['voice_day',2]:null;
    if(result)this.voice(result[0],{priority:result[1],replace:true});
  }
  getStatus(){
    return {ready:this.loaded,available:this.clips.size>0,unlocked:this.unlocked,hidden:this.hidden,
      kinds:Object.fromEntries([...KINDS].map(kind=>[kind,[...this.clips.values()].some(clip=>clip.kind===kind&&!this.failed.has(clip.id))])),
      effects:this.effects.length,voice:this.currentVoice?.id??null,voiceQueued:0,
      ambiencePlaying:Boolean(this.ambient?.playing),musicPlaying:Boolean(this.music?.playing),failedClips:this.failed.size,preferences:{...this.preferences},
      musicTracks:musicTracks.map(track=>({...track})),currentMusic:musicTracks.find(track=>track.id===this.currentMusicId)??null,
      musicMode:this.musicSelection==='random'?'random':'selected',selectedMusic:this.musicSelection,
      label:!this.preferences.enabled?'声音已关闭':!this.unlocked?'声音已开启，点击后播放':!this.clips.size?'声音暂不可用':'声音已开启'};
  }
  _notify(){try{this.onStatus(this.getStatus());}catch{}}
  destroy(){this.destroyed=true;this.stop();this.page?.removeEventListener?.('visibilitychange',this.visibilityHandler);this.page?.defaultView?.removeEventListener?.('pagehide',this.pageHideHandler);this.page?.defaultView?.removeEventListener?.('pageshow',this.pageShowHandler);}
}
