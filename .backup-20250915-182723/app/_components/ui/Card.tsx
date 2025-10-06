import React from 'react'

export default function Card({children, className=''}:{children:React.ReactNode; className?:string}) {
  return <div className={`bg-white border rounded-2xl shadow-sm ${className}`}>{children}</div>
}

