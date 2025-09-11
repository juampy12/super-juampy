'use client'
import React from 'react'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
}

export default function Button({ variant='primary', className='', ...props }: Props) {
  const base = 'px-4 py-2 rounded-xl text-sm font-medium transition'
  const variants = {
    primary: 'btn-primary border-none shadow-sm hover:scale-[0.99]',
    secondary: 'border bg-white hover:bg-black/5',
    ghost: 'hover:bg-black/5',
  } as const
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />
}
