/* Fixed, verified QR for https://torchlightskill.com/council/
 * Version 5 / error correction H. Four-module quiet zone is already included.
 * Draw directly to canvas: no CDN, image CORS or external QR service.
 */
export const SITE_QR_URL = "https://torchlightskill.com/council/";
const MATRIX = `000000000000000000000000000000000000000000000
000000000000000000000000000000000000000000000
000000000000000000000000000000000000000000000
000000000000000000000000000000000000000000000
000011111110100110001000000010010011111110000
000010000010110000100101111111011010000010000
000010111010011001101111011000100010111010000
000010111010111111001101000010110010111010000
000010111010101111101100110110110010111010000
000010000010111100101100011010011010000010000
000011111110101010101010101010101011111110000
000000000000000001010000111111000000000000000
000000010010000110101101010000110001110110000
000010011100000100011001000010010100111110000
000011110010010000010101111100001011010110000
000001101000000100110010000011010000000000000
000010111010001101000010000101001110000100000
000011011000000010010100010100100011010110000
000010011111010110000000101001000101101010000
000001000100011000010001101101101001000110000
000000100011000010111101000010011111011010000
000011010100010110000110010000101010110010000
000001110110000101001100011111001100110110000
000011011000110000011001001000111011101100000
000000101011111011101111111001111011100010000
000000010100011111010000110101100110001110000
000000001111110011100011101111100011100110000
000001111000111011100100011111000100110110000
000011000110001010101000101000111010100010000
000000001101000111011101100100110000000110000
000010000110011010110001001100111111101010000
000001011101111100100001010101001010110000000
000011101011010100011001001010011111101000000
000000000000101011011111000110111000100110000
000011111110010000111000001011111010101110000
000010000010000100001100011010111000101010000
000010111010010111001110010011101111110000000
000010111010100101101010000111000101111110000
000010111010010001010110111111011100100010000
000010000010010101010110011111011101000000000
000011111110011001000100110111011101000110000
000000000000000000000000000000000000000000000
000000000000000000000000000000000000000000000
000000000000000000000000000000000000000000000
000000000000000000000000000000000000000000000`.split("\n");
if (MATRIX.length!==45 || MATRIX.some(row=>row.length!==45 || /[^01]/.test(row))) {
  throw new Error("Invalid embedded site QR");
}
export function drawSiteQR(ctx,x,y,cell=13){
  ctx.fillStyle="#ffffff";
  ctx.fillRect(x,y,45*cell,45*cell);
  ctx.fillStyle="#151515";
  MATRIX.forEach((row,j)=>{
    for(let i=0;i<45;i++){
      if(row[i]==="1")ctx.fillRect(x+i*cell,y+j*cell,cell,cell);
    }
  });
}
function wrapPosterLine(ctx,text,maxWidth,maxLines){
  const output=[],chars=Array.from(String(text||"").replace(/\s+/g," ").trim());
  let line="";
  for(let i=0;i<chars.length;i++){
    const next=line+chars[i];
    if(line&&ctx.measureText(next).width>maxWidth){
      output.push(line);line=chars[i];
      if(output.length===maxLines)break;
    }else line=next;
  }
  if(output.length<maxLines&&line)output.push(line);
  const sum=output.join("").length;
  if(sum<chars.length&&output.length){
    const last=output.length-1;
    while(output[last] && ctx.measureText(output[last]+"…").width>maxWidth)output[last]=output[last].slice(0,-1);
    output[last]+="…";
  }
  return output;
}
export function drawCouncilPoster(canvas,{title,category,detail}={}){
  const ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("Canvas unavailable");
  if(canvas.width!==1080)canvas.width=1080;
  if(canvas.height!==1440)canvas.height=1440;
  ctx.fillStyle="#fff4dd";ctx.fillRect(0,0,1080,1440);
  ctx.strokeStyle="#26201a";ctx.lineWidth=7;ctx.strokeRect(42,42,996,1356);
  ctx.fillStyle="#ffd84d";ctx.fillRect(46,46,988,190);
  ctx.fillStyle="#26201a";
  ctx.font='800 73px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText("✳ 火炬议会",88,160);
  ctx.font="700 23px sans-serif";ctx.fillText("TORCHLIGHT COUNCIL / SS14",91,204);
  ctx.fillStyle="#b33b1c";
  ctx.font='800 29px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(String(category||"🗳️ 玩家投票").slice(0,45),94,311,890);
  ctx.fillStyle="#26201a";
  ctx.font='800 52px "PingFang SC","Microsoft YaHei",sans-serif';
  const lines=wrapPosterLine(ctx,title||"这道问题你站哪边？",892,3);
  lines.forEach((line,index)=>ctx.fillText(line,92,393+index*67,895));
  ctx.fillStyle="#785b42";ctx.font='600 25px "PingFang SC","Microsoft YaHei",sans-serif';
  const tagline=wrapPosterLine(ctx,detail||"扫码进入火炬议会，投出你的选择",885,1)[0]||"";
  ctx.fillText(tagline,93,608,890);
  ctx.fillStyle="#fffdf7";ctx.fillRect(220,637,640,632);
  ctx.strokeStyle="#26201a";ctx.lineWidth=4;ctx.strokeRect(220,637,640,632);
  drawSiteQR(ctx,247,661,13);
  ctx.fillStyle="#26201a";ctx.font='800 31px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign="center";ctx.fillText("📱 扫码进入火炬议会",540,1271,850);
  ctx.textAlign="left";
  ctx.fillStyle="#ffd84d";ctx.fillRect(46,1300,988,93);
  ctx.fillStyle="#26201a";ctx.font="750 29px monospace";
  ctx.fillText("torchlightskill.com/council/",91,1356,900);
  return SITE_QR_URL;
}
