addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  try {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "") {
      return jsonResponse({
        api: "CS2 DEMO Proxy",
        author: "鼠子 YuiNijika",
        description: "专门用于代理CS2 DEMO下载的API服务，支持所有replay服务器",
        endpoints: {
          proxy: "GET /{replayServerId}/{demoPath}",
          example: "/replay144/730/123456789/123456789.dem",
          allServersExample: "/replayXXX/730/123456789/123456789.dem"
        },
        usage: "将CS2 DEMO链接中的域名替换为此API的域名",
        note: "支持所有 replay{id} 格式的服务器ID"
      }, 200);
    }

    const pathMatch = url.pathname.match(/^\/(replay[a-zA-Z0-9]+)(\/.*)$/);
    
    if (!pathMatch) {
      return jsonResponse({ 
        error: 'Invalid URL format', 
        correctFormat: '/replay{id}/path/to/demo.dem',
        example: '/replay144/730/123456789/123456789.dem',
        example2: '/replay403/730/123456789/123456789.dem'
      }, 400);
    }
    
    const [, replayId, demoPath] = pathMatch;
    
    const targetDomain = `${replayId}.valve.net`;
    const targetUrl = `http://${targetDomain}${demoPath}${url.search}`;
    
    const newHeaders = new Headers();
    for (const [name, value] of request.headers.entries()) {
      if (!name.startsWith('cf-') && !name.startsWith('x-forwarded-') && name !== 'host') {
        newHeaders.set(name, value);
      }
    }
    
    newHeaders.set('Host', targetDomain);
    newHeaders.set('User-Agent', 'CS2DEMO-Proxy/YuiNijika.com');
    newHeaders.set('Accept', '*/*');
    newHeaders.set('Accept-Encoding', 'gzip, deflate, br');
    newHeaders.set('Connection', 'keep-alive');
    
    const proxyRequest = new Request(targetUrl, {
      headers: newHeaders,
      method: request.method,
      redirect: 'manual',
      cf: {
        cacheTtl: 0,
        cacheEverything: false,
        scrapeShield: false
      }
    });
    
    const response = await fetch(proxyRequest);
    
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        try {
          const redirectUrl = new URL(location, targetUrl);
          const redirectDomain = redirectUrl.hostname;
          
          if (redirectDomain.endsWith('.valve.net') && redirectDomain.startsWith('replay')) {
            const redirectReplayId = redirectDomain.split('.')[0];
            const redirectPath = redirectUrl.pathname + redirectUrl.search;
            const newLocation = `/${redirectReplayId}${redirectPath}`;
            
            return new Response(null, {
              status: response.status,
              headers: {
                'Location': newLocation,
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                'X-Proxy-Redirect': 'true',
                'X-Original-Location': location,
                'X-New-Location': newLocation
              }
            });
          } else {
            return new Response(null, {
              status: response.status,
              headers: {
                'Location': location,
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
              }
            });
          }
        } catch (error) {
          console.error('Error processing redirect:', error);
        }
      }
    }
    
    const responseHeaders = new Headers(response.headers);
    
    responseHeaders.set('X-CS2-Proxy', 'true');
    responseHeaders.set('X-Target-Server', targetDomain);
    responseHeaders.set('X-Proxy-Timestamp', new Date().toISOString());
    
    responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    responseHeaders.set('Pragma', 'no-cache');
    responseHeaders.set('Expires', '0');
    
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', '*');
    responseHeaders.set('Access-Control-Expose-Headers', '*');
    
    if (demoPath.includes('.dem')) {
      responseHeaders.set('Content-Type', 'application/octet-stream');
      responseHeaders.set('Content-Disposition', `attachment; filename="${demoPath.split('/').pop()}"`);
    }
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
    
  } catch (error) {
    console.error('Proxy error:', error);
    return jsonResponse({
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS, POST, PUT, DELETE',
      'Access-Control-Allow-Headers': '*',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
