import sys,re,html,urllib.request
import urllib.parse; u=urllib.parse.quote(sys.argv[1],safe=":/?=&%")
r=urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=30).read().decode('utf8','ignore')
m=re.findall(r'"datePublished"\s*:\s*"([^"]+)"',r)
t=re.sub(r'(?s)<(script|style|nav|footer|header)[^>]*>.*?</\1>',' ',r)
ps=[html.unescape(re.sub(r'<[^>]+>','',p)).strip() for p in re.findall(r'(?s)<p[^>]*>(.*?)</p>',t)]
print('DATE:',m[:1]); print('\n'.join(p for p in ps if len(p)>40)[:int(sys.argv[2]) if len(sys.argv)>2 else 4000])
