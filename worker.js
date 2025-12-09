addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  try {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "") {
      const parseParam = url.searchParams.get('parse');
      if (parseParam) {
        return handleParseRequest(request, parseParam);
      }
      
      return jsonResponse({
        api: "CS2 DEMO Proxy",
        author: "鼠子 YuiNijika",
        description: {
          en: "API service for proxying CS2 DEMO downloads, supports all replay servers",
          cn: "专门用于代理CS2 DEMO下载的API服务，支持所有replay服务器"
        },
        endpoints: {
          proxy: "GET /{replayServerId}/{demoPath}",
          parse: "GET /?parse={demo_url}",
          example: {
            en: "/replay144/730/123456789/123456789.dem",
            cn: "/replay144/730/123456789/123456789.dem"
          },
          example2: {
            en: "/replay144/730/123456789/123456789.dem.bz2",
            cn: "/replay144/730/123456789/123456789.dem.bz2"
          },
          parse_example: {
            en: "/?parse=http://replay144.valve.net/730/123456789/123456789.dem",
            cn: "/?parse=http://replay144.valve.net/730/123456789/123456789.dem"
          }
        },
        features: {
          en: [
            "Supports all replay server IDs",
            "Automatic redirect handling",
            "Auto-fallback to .dem.bz2 when .dem not found",
            "Bilingual responses (EN/CN)"
          ],
          cn: [
            "支持所有replay服务器ID",
            "自动重定向处理",
            ".dem文件不存在时自动尝试.dem.bz2",
            "支持中英文响应"
          ]
        }
      }, 200);
    }

    const pathMatch = url.pathname.match(/^\/(replay[a-zA-Z0-9]+)(\/.*)$/);
    
    if (!pathMatch) {
      const parseParam = url.searchParams.get('parse');
      if (parseParam) {
        return handleParseRequest(request, parseParam);
      }
      
      return jsonResponse({ 
        error: 'Invalid URL format',
        message: {
          en: "Invalid URL format. Please use the correct format.",
          cn: "URL格式错误，请使用正确的格式。"
        },
        details: {
          correctFormat: {
            en: '/replay{id}/path/to/demo.dem',
            cn: '/replay{id}/path/to/demo.dem'
          },
          correctFormat2: {
            en: '/replay{id}/path/to/demo.dem.bz2',
            cn: '/replay{id}/path/to/demo.dem.bz2'
          },
          example: {
            en: '/replay144/730/123456789/123456789.dem',
            cn: '/replay144/730/123456789/123456789.dem'
          },
          example2: {
            en: '/replay144/730/123456789/123456789.dem.bz2',
            cn: '/replay144/730/123456789/123456789.dem.bz2'
          },
          note: {
            en: "{id} can be any replay server ID, e.g., replay144, replay403, etc.",
            cn: "其中 {id} 可以是任意replay服务器ID，如 replay144, replay403 等"
          }
        }
      }, 400);
    }
    
    const [, replayId, demoPath] = pathMatch;
    
    let targetDomain = `${replayId}.valve.net`;
    let targetUrl = `http://${targetDomain}${demoPath}${url.search}`;
    
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
    
    if (response.status === 404) {
      const bz2Url = `${targetUrl}.bz2`;
      const bz2Request = new Request(bz2Url, {
        headers: newHeaders,
        method: request.method,
        redirect: 'manual',
        cf: {
          cacheTtl: 0,
          cacheEverything: false,
          scrapeShield: false
        }
      });
      
      const bz2Response = await fetch(bz2Request);
      
      if (bz2Response.status === 200) {
        const responseHeaders = new Headers(bz2Response.headers);
        
        responseHeaders.set('X-CS2-Proxy', 'true');
        responseHeaders.set('X-Target-Server', targetDomain);
        responseHeaders.set('X-Proxy-Timestamp', new Date().toISOString());
        responseHeaders.set('X-File-Fallback', 'true');
        responseHeaders.set('X-Original-File-Not-Found', 'true');
        responseHeaders.set('X-File-Type', 'dem.bz2');
        responseHeaders.set('X-Proxy-Message-EN', 'Original .dem file not found, automatically returned .bz2 compressed version');
        responseHeaders.set('X-Proxy-Message-CN', '原始.dem文件不存在，已自动返回.bz2压缩版本');
        
        responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        responseHeaders.set('Pragma', 'no-cache');
        responseHeaders.set('Expires', '0');
        
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        responseHeaders.set('Access-Control-Allow-Headers', '*');
        responseHeaders.set('Access-Control-Expose-Headers', '*');
        
        responseHeaders.set('Content-Type', 'application/octet-stream');
        responseHeaders.set('Content-Disposition', `attachment; filename="${demoPath.split('/').pop()}.bz2"`);
        
        return new Response(bz2Response.body, {
          status: 200,
          statusText: 'OK',
          headers: responseHeaders
        });
      }
    }
    
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
                'X-New-Location': newLocation,
                'X-Proxy-Message-EN': 'Redirect detected to another replay server',
                'X-Proxy-Message-CN': '检测到重定向到其他replay服务器'
              }
            });
          } else {
            return new Response(null, {
              status: response.status,
              headers: {
                'Location': location,
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                'X-Proxy-Message-EN': 'Redirect to external server',
                'X-Proxy-Message-CN': '重定向到外部服务器'
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
    
    const filename = demoPath.split('/').pop();
    if (filename.endsWith('.dem') || filename.endsWith('.dem.bz2')) {
      responseHeaders.set('Content-Type', 'application/octet-stream');
      responseHeaders.set('Content-Disposition', `attachment; filename="${filename}"`);
      responseHeaders.set('X-File-Type', filename.endsWith('.dem.bz2') ? 'dem.bz2' : 'dem');
      responseHeaders.set('X-Proxy-Message-EN', 'CS2 DEMO file download');
      responseHeaders.set('X-Proxy-Message-CN', 'CS2 DEMO文件下载');
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
      message: {
        en: "An internal server error occurred while processing your request.",
        cn: "处理请求时发生内部服务器错误。"
      },
      technical: error.message,
      timestamp: new Date().toISOString(),
      support: {
        en: "Please contact administrator for support.",
        cn: "如需帮助，请联系管理员。"
      }
    }, 500);
  }
}

function handleParseRequest(request, parseParam) {
  try {
    let demoUrl = parseParam;
    
    if (!demoUrl.startsWith('http://') && !demoUrl.startsWith('https://')) {
      demoUrl = 'http://' + demoUrl;
    }
    
    const url = new URL(demoUrl);
    const hostname = url.hostname;
    
    if (!hostname.endsWith('.valve.net') || !hostname.startsWith('replay')) {
      return jsonResponse({
        error: 'Invalid demo URL',
        message: {
          en: "Invalid demo URL. Must be a Valve replay server URL.",
          cn: "无效的DEMO URL，必须是Valve replay服务器URL。"
        },
        details: {
          example: {
            en: 'http://replay144.valve.net/730/123456789/123456789.dem',
            cn: 'http://replay144.valve.net/730/123456789/123456789.dem'
          },
          format: {
            en: 'http://replay{id}.valve.net/730/match_id/match_id.dem',
            cn: 'http://replay{id}.valve.net/730/match_id/match_id.dem'
          },
          note: {
            en: "{id} can be replay144, replay403, replay402, etc.",
            cn: "其中 {id} 可以是 replay144, replay403, replay402 等"
          }
        }
      }, 400);
    }
    
    const replayId = hostname.split('.')[0];
    const demoPath = url.pathname + url.search;
    
    const proxyUrl = `/${replayId}${demoPath}`;
    const currentOrigin = new URL(request.url).origin;
    
    return jsonResponse({
      success: true,
      message: {
        en: "URL successfully parsed and converted to proxy format.",
        cn: "URL解析成功，已转换为代理格式。"
      },
      data: {
        original_url: demoUrl,
        replay_server: hostname,
        replay_id: replayId,
        demo_path: url.pathname,
        proxy_url: proxyUrl,
        full_proxy_url: `${currentOrigin}${proxyUrl}`,
        features: {
          en: [
            "Direct download support",
            "Auto-fallback to .dem.bz2 if .dem not found",
            "Automatic server redirect handling"
          ],
          cn: [
            "支持直接下载",
            ".dem不存在时自动尝试.dem.bz2",
            "自动处理服务器重定向"
          ]
        }
      },
      timestamp: new Date().toISOString()
    }, 200);
    
  } catch (error) {
    return jsonResponse({
      error: 'Failed to parse URL',
      message: {
        en: "Failed to parse the provided URL. Please check the format.",
        cn: "解析提供的URL失败，请检查格式。"
      },
      technical: error.message,
      example: {
        en: '/?parse=http://replay144.valve.net/730/123456789/123456789.dem',
        cn: '/?parse=http://replay144.valve.net/730/123456789/123456789.dem'
      },
      note: {
        en: "Please ensure the URL format is correct and includes full http:// or https:// prefix",
        cn: "请确保URL格式正确，并且包含完整的http://或https://前缀"
      }
    }, 400);
  }
}

function jsonResponse(data, status = 200) {
  const responseData = {
    ...data,
    author: "鼠子 YuiNijika",
    github: "https://github.com/YuiNijika/CS2DemoProxy",
    timestamp: new Date().toISOString()
  };
  
  return new Response(JSON.stringify(responseData, null, 2), {
    status: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS, POST, PUT, DELETE',
      'Access-Control-Allow-Headers': '*',
      'X-Content-Type-Options': 'nosniff',
      'X-Language': 'bilingual'
    }
  });
}
