addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

const VALVE_DOMAIN_PATTERN = /^replay\d+\.valve\.net$/;

async function handleRequest(request) {
  try {
    const url = new URL(request.url);
    
    if (url.pathname === "/" || url.pathname === "") {
      return jsonResponse({
        api: "CS2 DEMO Proxy",
        version: "2.0.0",
        description: "CS2 DEMO代理API，支持所有replay*.valve.net服务器 / CS2 DEMO Proxy API supporting all replay*.valve.net servers",
        endpoints: {
          proxy: "GET /{replayServerId}/{demoPath}",
          example: "/replay144/730/123456789/123456789.dem"
        },
        usage: "将CS2 DEMO链接中的域名替换为此API域名 / Replace the domain in CS2 DEMO link with this API domain"
      }, 200);
    }
    
    const pathMatch = url.pathname.match(/^\/(replay\d+)(\/.*)$/);
    
    if (!pathMatch) {
      return jsonResponse({ 
        error: 'Invalid URL format / 无效的URL格式',
        correctFormat: '/replay{id}/path/to/demo.dem',
        example: '/replay144/730/123456789/123456789.dem',
        note: 'replay{id}必须包含数字，例如: replay144, replay123 / replay{id} must contain numbers, e.g., replay144, replay123'
      }, 400);
    }
    
    const [, replayId, demoPath] = pathMatch;
    
    if (!/^replay\d+$/.test(replayId)) {
      return jsonResponse({ 
        error: 'Invalid replay server ID format / 无效的服务器ID格式',
        expected: 'replay{number}',
        example: 'replay144',
        yourInput: replayId
      }, 400);
    }
    
    const targetDomain = `${replayId}.valve.net`;
    const targetUrl = `https://${targetDomain}${demoPath}${url.search}`;
    
    const newHeaders = new Headers();
    for (const [name, value] of request.headers.entries()) {
      if (!name.startsWith('cf-') && !name.startsWith('x-forwarded-') && name !== 'host') {
        newHeaders.set(name, value);
      }
    }
    
    newHeaders.set('Host', targetDomain);
    newHeaders.set('User-Agent', 'CS2-DEMO-Proxy/2.0');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      const proxyRequest = new Request(targetUrl, {
        headers: newHeaders,
        method: request.method,
        redirect: 'manual',
        signal: controller.signal
      });
      
      const response = await fetch(proxyRequest);
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status} ${response.statusText} / 服务器响应状态: ${response.status} ${response.statusText}`);
      }
      
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (location) {
          try {
            const redirectUrl = new URL(location, targetUrl);
            const redirectDomain = redirectUrl.hostname;
            
            if (VALVE_DOMAIN_PATTERN.test(redirectDomain)) {
              const redirectReplayId = redirectDomain.split('.')[0];
              const redirectPath = redirectUrl.pathname + redirectUrl.search;
              const newLocation = `/${redirectReplayId}${redirectPath}`;
              
              return new Response(null, {
                status: response.status,
                statusText: response.statusText,
                headers: {
                  'Location': newLocation,
                  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                  'X-Proxy-Redirect': 'true',
                  'X-Target-Server': redirectDomain
                }
              });
            }
          } catch (error) {
            console.error('Redirect error:', error);
          }
        }
      }
      
      const responseHeaders = new Headers(response.headers);
      
      responseHeaders.set('X-CS2-Proxy', 'true');
      responseHeaders.set('X-Target-Server', targetDomain);
      responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      
      if (demoPath.includes('.dem')) {
        responseHeaders.set('Content-Type', 'application/octet-stream');
        const filename = demoPath.split('/').pop() || 'demo.dem';
        responseHeaders.set('Content-Disposition', `attachment; filename="${filename}"`);
      }
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        throw new Error(`Request to ${targetDomain} timed out after 30 seconds / 请求${targetDomain}超时(30秒)`);
      } else if (fetchError.message.includes('dns')) {
        throw new Error(`Cannot resolve DNS for ${targetDomain}. The server may not exist. / 无法解析${targetDomain}的DNS，服务器可能不存在`);
      } else if (fetchError.message.includes('NetworkError')) {
        throw new Error(`Network error when connecting to ${targetDomain}. The server may be unreachable. / 连接${targetDomain}时网络错误，服务器可能无法访问`);
      } else if (fetchError.message.includes('SSL') || fetchError.message.includes('TLS')) {
        throw new Error(`SSL/TLS error when connecting to ${targetDomain}. The certificate may be invalid. / 连接${targetDomain}时SSL/TLS错误，证书可能无效`);
      } else if (fetchError.message.includes('Failed to fetch')) {
        throw new Error(`Failed to connect to ${targetDomain}. The server may be down or blocking the request. / 无法连接到${targetDomain}，服务器可能已关闭或阻止请求`);
      } else {
        throw new Error(`Failed to connect to ${targetDomain}: ${fetchError.message} / 连接${targetDomain}失败: ${fetchError.message}`);
      }
    }
    
  } catch (error) {
    console.error('Proxy error:', error.message);
    
    return jsonResponse({
      error: 'Proxy request failed / 代理请求失败',
      message: error.message,
      target: request.url,
      timestamp: new Date().toISOString(),
      suggestions: [
        'Check if the replay server ID is correct (e.g., replay144) / 检查服务器ID是否正确(例如: replay144)',
        'Verify the demo path is correct / 验证DEMO路径是否正确',
        'The target server may be offline or unreachable / 目标服务器可能离线或无法访问',
        'Try a different replay server ID if available / 尝试使用其他可用的服务器ID'
      ]
    }, 502);
  }
}

addEventListener('fetch', event => {
  if (event.request.method === 'OPTIONS') {
    event.respondWith(handleOptions(event.request));
  }
});

async function handleOptions(request) {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
    }
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
      'X-CS2-Proxy-Error': status >= 400 ? 'true' : 'false'
    }
  });
}
