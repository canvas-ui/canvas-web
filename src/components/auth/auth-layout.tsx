import * as React from "react"
import { Card } from "@/components/ui/card"
import { Link } from "react-router-dom"

interface AuthLayoutProps {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4">
      <Card className="flex w-[95vw] h-[95vh] overflow-hidden">
        <div className="hidden md:block w-1/2 relative bg-black">
          <Link to="/">
            <a  className="absolute top-8 left-8 font-bold text-white flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="mr-2 h-6 w-6"><path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"></path></svg>
              <span className="text-2xl font-bold text-white">Canvas</span>
            </a>
          </Link>
          <div className="absolute bottom-8 left-8 text-lg text-white max-w-[80%]">
            Contextualize your unstructured Universe!
          </div>
        </div>
        <div className="flex w-full md:w-1/2 flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-sm">
            {children}
          </div>
        </div>
      </Card>
    </div>
  )
}