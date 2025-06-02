import * as React from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthLayout } from "@/components/auth/auth-layout"
import { loginUser, isAuthenticated, getAuthConfig } from "@/services/auth"

interface FormData {
  email: string
  password: string
  strategy: string
}

interface AuthConfig {
  strategies: {
    local: { enabled: boolean }
    imap: {
      enabled: boolean
      domains: Array<{
        domain: string
        name: string
        requireAppPassword: boolean
      }>
    }
  }
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = React.useState<boolean>(false)
  const [errors, setErrors] = React.useState<Partial<FormData>>({})
  const [authConfig, setAuthConfig] = React.useState<AuthConfig | null>(null)
  const [formData, setFormData] = React.useState<FormData>({
    email: "",
    password: "",
    strategy: "auto",
  })

  // Check if we're already logged in and load auth config
  React.useEffect(() => {
    if (isAuthenticated()) {
      navigate('/workspaces');
    }

    // Load authentication configuration
    getAuthConfig().then(config => {
      setAuthConfig(config);
    }).catch(error => {
      console.error('Failed to load auth config:', error);
    });
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
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
      console.log('Attempting login with:', formData.email, 'strategy:', formData.strategy);
      const response = await loginUser(formData.email, formData.password, formData.strategy);
      console.log('Login successful, received token:', !!response.payload?.token);

      // Clear any existing errors
      setErrors({})

      // Navigate to home page
      navigate("/home")
    } catch (error) {
      console.error('Login error:', error);

      // Extract the most specific error message from the server response
      let errorMessage = "Login failed";

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        // Handle API response error objects
        const apiError = error as any;
        if (apiError.message) {
          errorMessage = apiError.message;
        } else if (apiError.error) {
          errorMessage = apiError.error;
        } else if (apiError.payload?.message) {
          errorMessage = apiError.payload.message;
        }
      }

      setErrors({
        password: errorMessage
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="flex flex-col space-y-4">
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground">
            Enter your credentials to access your account
          </p>
        </div>

        <form onSubmit={onSubmit}>
          <div className="grid gap-4">
            {authConfig?.strategies?.imap?.enabled && authConfig.strategies.imap.domains.length > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="strategy">Authentication Method</Label>
                <select
                  id="strategy"
                  name="strategy"
                  value={formData.strategy}
                  onChange={handleInputChange}
                  disabled={isLoading}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="auto">Auto-detect</option>
                  <option value="local">Local Account</option>
                  <option value="imap">Email Server (IMAP)</option>
                </select>
              </div>
            )}

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
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
              <Button
                variant="outline"
                type="button"
                disabled={isLoading}
                onClick={() => navigate("/register")}
              >
                Don't have an account? Sign up
              </Button>
            </div>
          </div>
        </form>
      </div>
    </AuthLayout>
  )
}
