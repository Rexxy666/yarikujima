/* 浮島記帳 — 輕量後端代理
   金鑰只放 .env（GEMINI_API_KEY），前端呼叫 /api/chat，由這裡補上金鑰轉發給 Gemini。
   啟動：  node server.js   然後開 http://localhost:8787
   零外部相依，只用 Node 內建模組。 */
const http=require('http'), https=require('https'), fs=require('fs'), path=require('path');

// --- 讀取 .env（簡易解析，不需 dotenv 套件）---
try{
  fs.readFileSync(path.join(__dirname,'.env'),'utf8').split(/\r?\n/).forEach(line=>{
    if(!line || line.trim().startsWith('#')) return;
    const m=line.match(/^\s*([\w.\-]+)\s*=\s*(.*)\s*$/);
    if(m){ let v=m[2].trim().replace(/^["']|["']$/g,''); if(!(m[1] in process.env)) process.env[m[1]]=v; }
  });
}catch(e){ /* 沒有 .env 也能啟動，只是聊天會提示未設定 */ }

const PORT  = process.env.PORT || 8787;
const KEY   = (process.env.GEMINI_API_KEY || '').trim();
const MODEL = (process.env.GEMINI_MODEL   || 'gemini-flash-latest').trim();

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.json':'application/json; charset=utf-8','.ico':'image/x-icon'};

const server=http.createServer((req,res)=>{
  // --- Gemini 代理端點 ---
  if(req.method==='POST' && req.url==='/api/chat'){
    let data=''; req.on('data',c=>data+=c);
    req.on('end',()=>{
      if(!KEY){
        res.writeHead(500,{'Content-Type':'application/json'});
        return res.end(JSON.stringify({error:{message:'後端尚未設定 GEMINI_API_KEY，請在 .env 填入金鑰後重啟伺服器。'}}));
      }
      let payload; try{ payload=JSON.parse(data||'{}'); }catch(e){ res.writeHead(400); return res.end('{}'); }
      const gbody=JSON.stringify(payload);
      const opts={hostname:'generativelanguage.googleapis.com',
        path:`/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(KEY)}`,
        method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(gbody)}};
      const gr=https.request(opts,gres=>{
        let out=''; gres.on('data',c=>out+=c);
        gres.on('end',()=>{ res.writeHead(gres.statusCode,{'Content-Type':'application/json'}); res.end(out); });
      });
      gr.on('error',e=>{ res.writeHead(502,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:{message:e.message}})); });
      gr.write(gbody); gr.end();
    });
    return;
  }

  // --- 靜態檔（index.html 等）---
  let rel = req.url==='/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  rel = path.normalize(rel).replace(/^(\.\.[\/\\])+/,'');   // 防目錄穿越
  const fp = path.join(__dirname, rel);
  if(!fp.startsWith(__dirname)){ res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(fp,(err,buf)=>{
    if(err){ res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200,{'Content-Type':MIME[path.extname(fp).toLowerCase()]||'application/octet-stream'});
    res.end(buf);
  });
});

server.listen(PORT,()=>{
  console.log(`\n🏝️  浮島記帳已啟動 → http://localhost:${PORT}`);
  console.log(KEY ? `🔮  Gemini 聊天已就緒（模型：${MODEL}）` : `⚠️  尚未設定 GEMINI_API_KEY，聊天會退回內建台詞。請在 .env 填入金鑰。`);
});
