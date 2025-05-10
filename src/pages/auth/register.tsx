import * as React from "react"
import { Link, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthLayout } from "@/components/auth/auth-layout"
import { registerUser } from "@/services/auth"
import { useToast } from "@/components/ui/toast-container"

interface FormData {
  email: string
  password: string
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [isLoading, setIsLoading] = React.useState<boolean>(false)
  const [errors, setErrors] = React.useState<Partial<FormData>>({})
  const [formData, setFormData] = React.useState<FormData>({
    email: "",
    password: ""
  })
  const [registrationComplete, setRegistrationComplete] = React.useState<boolean>(false)

  const validateForm = (): boolean => {
    const newErrors: Partial<FormData> = {}
    if (!formData.email) {
      newErrors.email = "Email is required"
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Email is invalid"
    }
    if (!formData.password) {
      newErrors.password = "Password is required"
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters"
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.id]: e.target.value })
  }

  const onSubmit = async (event: React.SyntheticEvent) => {
    event.preventDefault()
    if (!validateForm()) {
      return
    }
    setIsLoading(true)
    try {
      const response = await registerUser(formData.email, formData.password)
      console.log('Registration successful:', response)

      showToast({
        title: "Registration Successful",
        description: "You can now log in with your credentials.",
        variant: "default"
      })
      setRegistrationComplete(true)
      setFormData({ email: "", password: "" }) // Clear form
      setErrors({})
    } catch (error) {
      console.error('Registration failed:', error)
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred"
      setErrors({ ...errors, email: errorMessage })
      showToast({
        title: "Registration Failed",
        description: errorMessage,
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (registrationComplete) {
    return (
      <AuthLayout>
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Registration Successful!</h1>
          <p className="text-sm text-muted-foreground">
            You have successfully created your account.
          </p>
        </div>
        <div className="space-y-6 text-center pt-6">
          <p className="text-muted-foreground">
            Please proceed to the login page to access your account.
          </p>
          <Button asChild className="w-full">
            <Link to="/login">Go to Login</Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email below to create your account
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4 pt-6">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="name@example.com"
            value={formData.email}
            onChange={handleChange}
            disabled={isLoading}
            required
          />
          {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={formData.password}
            onChange={handleChange}
            disabled={isLoading}
            required
          />
          {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Creating Account..." : "Create Account"}
        </Button>
      </form>
      <div className="mt-4 text-center text-sm">
        Already have an account?{" "}
        <Link to="/login" className="underline">
          Sign in
        </Link>
      </div>
      <div className="px-8 py-4 text-center text-sm text-muted-foreground border-t mt-6">
        By clicking continue, you agree to our{" "}
        <Link
          to="/terms"
          className="underline underline-offset-4 hover:text-primary"
        >
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link
          to="/privacy"
          className="underline underline-offset-4 hover:text-primary"
        >
          Privacy Policy
        </Link>
        .
      </div>
    </AuthLayout>
  )
}
