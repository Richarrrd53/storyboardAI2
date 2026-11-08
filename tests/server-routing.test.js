const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');
test('SPA documents and legacy API aliases remain separate under Express/Vercel paths', async () => {
  const server = app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  try {
    for (const path of ['/projects','/projects?filter=brand','/dashboard','/history','/template','/project/example','/generate']) {
      const response=await fetch(origin+path,{headers:{accept:'text/html'}});
      assert.equal(response.status,200,path);
      assert.match(response.headers.get('content-type'),/text\/html/);
      assert.match(await response.text(),/main\.js/);
    }
    for (const [path,headers] of [
      ['/api/projects',{}],
      ['/projects',{accept:'application/json'}],
      ['/api/index.js',{'x-matched-path':'/api/projects'}],
      ['/api/projects',{authorization:'Bearer invalid-token'}]
    ]) {
      const response=await fetch(origin+path,{headers});
      assert.ok([401,403].includes(response.status),path);
      assert.match(response.headers.get('content-type'),/application\/json/);
    }
    const rewritten=await fetch(origin+'/api/index.js',{headers:{accept:'text/html','x-matched-path':'/projects'}});
    assert.equal(rewritten.status,200); assert.match(rewritten.headers.get('content-type'),/text\/html/);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
