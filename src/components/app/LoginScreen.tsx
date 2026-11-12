'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, ShieldCheck, Landmark } from 'lucide-react'
import { apiSend, RequestError } from '@/lib/client/api'
import { useAppStore } from '@/lib/client/store'

const DEMO_ACCOUNTS = [
  { email: 'admin@demo.in', label: 'Super Admin' },
  { email: 'manager@demo.in', label: 'Manager' },
  { email: 'employee1@demo.in', label: 'Employee' },
  { email: 'ca@demo.in', label: 'CA Reviewer' },
  { email: 'knowledge@demo.in', label: 'Knowledge Manager' },
  { email: 'client@demo.in', label: 'Client' },
]

export default function LoginScreen() {
  const setUser = useAppStore((s) => s.setUser)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [regName, setRegName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function signIn(mail = email, pwd = password) {
    setBusy(true)
    setError(null)
    try {
      const res = await apiSend<{ user: { id: string; email: string; name: string; role: string } }>('POST', '/api/auth/login', { email: mail, password: pwd })
      setUser(res.user)
      window.location.hash = '#/dashboard'
    } catch (e) {
      setError(e instanceof RequestError ? e.message : 'Sign in failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function register() {
    setBusy(true)
    setError(null)
    try {
      const res = await apiSend<{ user: { id: string; email: string; name: string; role: string } }>('POST', '/api/auth/register', { name: regName, email: regEmail, phone: regPhone, password: regPassword })
      setUser(res.user)
      window.location.hash = '#/dashboard'
    } catch (e) {
      setError(e instanceof RequestError ? e.message : 'Registration failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8 items-center">
          <div className="hidden md:block">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <Landmark className="h-8 w-8" aria-hidden />
              <span className="text-2xl font-semibold">Compliance Desk</span>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Tax &amp; Business Compliance Management</h1>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              One workspace for your firm&apos;s services, client applications, document verification,
              professional review, government filing assistance and recurring compliance obligations.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" aria-hidden /> Role-based access for CA firms, teams and clients</li>
              <li className="flex gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" aria-hidden /> Configuration-driven services with professional approval lifecycle</li>
              <li className="flex gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" aria-hidden /> Filing evidence recorded; internal work never shown as official filing</li>
            </ul>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="md:hidden text-xl font-semibold">Compliance Desk</CardTitle>
              <CardDescription>Sign in to continue, or register as a client.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="signin">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="register">Register</TabsTrigger>
                </TabsList>

                <TabsContent value="signin" className="mt-4 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@firm.in" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void signIn() }} placeholder="••••••••" />
                  </div>
                  <Button className="w-full" onClick={() => void signIn()} disabled={busy || !email || !password}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Sign in
                  </Button>

                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-2">Demo accounts (password <code className="font-mono">Demo@1234</code>):</p>
                    <div className="flex flex-wrap gap-1.5">
                      {DEMO_ACCOUNTS.map((a) => (
                        <Button key={a.email} type="button" variant="outline" size="sm" className="h-7 text-xs"
                          onClick={() => { setEmail(a.email); setPassword('Demo@1234'); void signIn(a.email, 'Demo@1234') }}>
                          {a.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="register" className="mt-4 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="regName">Full name</Label>
                    <Input id="regName" value={regName} onChange={(e) => setRegName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="regEmail">Email</Label>
                    <Input id="regEmail" type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="regPhone">Mobile (10-digit)</Label>
                    <Input id="regPhone" value={regPhone} onChange={(e) => setRegPhone(e.target.value)} placeholder="98XXXXXXXX" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="regPassword">Password (min 8 characters)</Label>
                    <Input id="regPassword" type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} />
                  </div>
                  <Button className="w-full" onClick={() => void register()} disabled={busy || !regName || !regEmail || regPassword.length < 8}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Create client account
                  </Button>
                  <p className="text-xs text-muted-foreground">Staff accounts are created by your administrator.</p>
                </TabsContent>
              </Tabs>

              {error && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</p>}
              {info && <p className="mt-3 text-sm text-muted-foreground">{info}</p>}
            </CardContent>
          </Card>
        </div>
      </main>
      <footer className="mt-auto border-t py-3 text-center text-xs text-muted-foreground px-4">
        Demonstration environment. All legal service configurations shown here are unverified examples pending professional (CA) review against official government sources.
      </footer>
    </div>
  )
}
