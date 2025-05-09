import * as React from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthLayout } from "@/components/auth/auth-layout"
import { registerUser, isAuthenticated } from "@/services/auth"

interface FormData {
  email: string
  password: string
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = React.useState<boolean>(false)
  const [errors, setErrors] = React.useState<Partial<FormData>>({})
  const [formData, setFormData] = React.useState<FormData>({
    email: "",
    password: ""
  })

  // Check if we're already logged in
  React.useEffect(() => {
    if (isAuthenticated()) {
      navigate('/workspaces');
    }
  }, [navigate]);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  async function onSubmit(event: React.SyntheticEvent) {
    event.preventDefault()
    if (!validateForm()) return

    setIsLoading(true)
    try {
      console.log('Attempting registration with:', formData.email);
      const response = await registerUser(
        formData.email,
        formData.password
      );

      console.log('Registration successful:', response);

      // Navigate to login page after successful registration
      navigate("/login", {
        state: {
          message: "Registration successful! Please check your email for verification instructions, or log in if email verification is not required."
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      const errorMessage = error instanceof Error ? error.message : "Registration failed"
      setErrors({
        email: errorMessage
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="flex flex-col space-y-4">
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
          <p className="text-sm text-muted-foreground">
            Enter your information below to create your account
          </p>
        </div>

        <form onSubmit={onSubmit}>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                placeholder="name@example.com"
                type="email"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect="off"
                disabled={isLoading}
                value={formData.email}
                onChange={handleInputChange}
              />
              {errors.email && (
                <p className="text-sm text-red-500">{errors.email}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                disabled={isLoading}
                value={formData.password}
                onChange={handleInputChange}
              />
              {errors.password && (
                <p className="text-sm text-red-500">{errors.password}</p>
              )}
            </div>

            <div className="flex flex-col space-y-4">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Creating account..." : "Create account"}
              </Button>
              <Button
                variant="outline"
                type="button"
                disabled={isLoading}
                onClick={() => navigate("/login")}
              >
                Already have an account? Sign in
              </Button>
            </div>
          </div>
        </form>
      </div>
    </AuthLayout>
  )
}
