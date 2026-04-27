import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Eye, EyeOff, Shield, Building, Users, CheckCircle } from "lucide-react";
import exlLogo from "@/assets/exl-logo.svg";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters")
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: ""
    }
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      console.log("Attempting login with:", data);
      const response = await apiRequest("POST", "/api/auth/login", data);
      const result = await response.json();
      console.log("Login response:", result);
      return result;
    },
    onSuccess: async (data) => {
      console.log("Login successful:", data);
      // Invalidate auth queries to refresh user state
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      // Clear any cached data
      queryClient.clear();
      // Navigate to home
      setLocation("/");
    },
    onError: (error: Error) => {
      console.error("Login error:", error);
      setLoginError(error.message || "Login failed. Please try again.");
    }
  });

  const onSubmit = (data: LoginFormData) => {
    setLoginError(null);
    loginMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-6xl">
        <Card className="shadow-2xl border border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-8">

            {/* Left Side - Platform Information */}
            <div className="space-y-8">
              <div className="flex items-center space-x-4">
                <img src={exlLogo} alt="EXL" className="h-14 w-auto" />
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Agentic Platform</h1>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">Advanced AI Processing</h3>
                    <p className="text-muted-foreground mt-1">Leverage cutting-edge AI agents for comprehensive insurance underwriting analysis with 95%+ accuracy.</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Building className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">Enterprise-Grade Security</h3>
                    <p className="text-muted-foreground mt-1">Insurance-grade encryption and compliance with industry standards for secure document processing.</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Users className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">Multi-Agent Workflow</h3>
                    <p className="text-muted-foreground mt-1">Seamlessly orchestrated AI agents working together for complete underwriting automation.</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-6">
                <h4 className="text-lg font-semibold text-foreground mb-4">Platform Statistics</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">99.9%</div>
                    <div className="text-sm text-muted-foreground">Uptime</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">5 min</div>
                    <div className="text-sm text-muted-foreground">Avg Processing</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">150+</div>
                    <div className="text-sm text-muted-foreground">Cases Processed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">95%</div>
                    <div className="text-sm text-muted-foreground">Accuracy Rate</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side - Login Form */}
            <div className="w-full max-w-md mx-auto space-y-6">
              <div className="text-center space-y-2">
                <div className="flex justify-center lg:hidden mb-4">
                  <div className="w-16 h-16 bg-orange-50 dark:bg-orange-950 rounded-xl flex items-center justify-center">
                    <div className="h-10 w-16 bg-orange-500 rounded flex items-center justify-center text-white font-bold text-sm">EXL</div>
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-foreground">Welcome Back</h2>
                <p className="text-muted-foreground">
                  Sign in to your EXLerate AI account to access the underwriting platform
                </p>
              </div>
              
              <div className="space-y-4">
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    {...form.register("email")}
                    className="h-11"
                  />
                  {form.formState.errors.email && (
                    <p className="text-sm text-red-600">{form.formState.errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      {...form.register("password")}
                      className="h-11 pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-11 px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400" />
                      )}
                    </Button>
                  </div>
                  {form.formState.errors.password && (
                    <p className="text-sm text-red-600">{form.formState.errors.password.message}</p>
                  )}
                </div>

                {loginError && (
                  <Alert className="border-red-200 bg-red-50">
                    <AlertDescription className="text-red-700">
                      {loginError}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Signing in...</span>
                    </div>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>

                <div className="mt-6 pt-4 border-t border-border">
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
                    <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">Demo Credentials</h4>
                    <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                      <div><strong>Email:</strong> admin@example.com</div>
                      <div><strong>Password:</strong> password123</div>
                    </div>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">Use these credentials for testing or create your own account</p>
                  </div>

                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Secure authentication powered by enterprise-grade encryption</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
        
        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>© 2025 EXL Xtrakto.AI. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}