'use client'
import { useEffect } from 'react'

function setVars(r:number, g:number, b:number){
  const root = document.documentElement
  root.style.setProperty('--brand', `${r} ${g} ${b}`)
  const luminance = 0.2126 * Math.pow(r/255, 2.2) + 0.7152 * Math.pow(g/255, 2.2) + 0.0722 * Math.pow(b/255, 2.2)
  const fg = luminance > 0.6 ? '0 0 0' : '255 255 255'
  root.style.setProperty('--brand-fg', fg)
  const d = (x:number, f:number) => Math.max(0, Math.min(255, Math.round(x*f)))
  root.style.setProperty('--brand-600', `${d(r,0.8)} ${d(g,0.8)} ${d(b,0.8)}`)
  root.style.setProperty('--brand-700', `${d(r,0.65)} ${d(g,0.65)} ${d(b,0.65)}`)
}

export default function BrandTheme(){
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = '/logo-super-juampy.png'
    img.onload = () => {
      try{
        const c = document.createElement('canvas')
        c.width = img.naturalWidth; c.height = img.naturalHeight
        const ctx = c.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const data = ctx.getImageData(0,0,c.width,c.height).data
        let r=0,g=0,b=0,cnt=0
        for(let i=0;i<data.length;i+=4){
          const a = data[i+3]; if(a<200) continue
          const R=data[i], G=data[i+1], B=data[i+2]
          if(R>245 && G>245 && B>245) continue  // descarta blancos
          r+=R; g+=G; b+=B; cnt++
        }
        if(cnt>0){ setVars(Math.round(r/cnt), Math.round(g/cnt), Math.round(b/cnt)) }
      }catch{}
    }
  }, [])
  return null
}

