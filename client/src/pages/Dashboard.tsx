import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useBehaviorCollector } from "@/hooks/useBehaviorCollector";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Fingerprint, Shield, AlertTriangle, XCircle, LogOut,
  Activity, MousePointer, Keyboard, RefreshCw, CheckCircle, Clock
} from "lucide-react";
import { nanoid } from "nanoid";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

const SESSION_KEY = "bio_session_id";

function getRiskColor(level: string) {
  switch (level) {
    case "LOW": return "text-green-400";
    case "MEDIUM": return "text-yellow-400";
    case "HIGH": return "text-orange-400";
    case "CRITICAL": return "text-red-400";
    default: return "text-slate-400";
  }
}

function getRiskBg(level: string) {
  switch (level) {
    case "LOW": return "bg-green-400/10 border-green-500/30";
    case "MEDIUM": return "bg-yellow-400/10 border-yellow-500/30";
    case "HIGH": return "bg-orange-400/10 border-orange-500/30";
    case "CRITICAL": return "bg-red-400/10 border-red-500/30";
    default: return "bg-slate-400/10 border-slate-500/30";
  }
}

function RiskIcon({ level }: { level: string }) {
  switch (level) {
    case "LOW": return <CheckCircle className="w-5 h-5 text-green-400" />;
    case "MEDIUM": return <Clock className="w-5 h-5 text-yellow-400" />;
    case "HIGH": return <AlertTriangle className="w-5 h-5 text-orange-400" />;
    case "CRITICAL": return <XCircle className="w-5 h-5 text-red-400" />;
    default: return <Shield className="w-5 h-5 text-slate-400" />;
  }
}

interface RiskState {
  anomalyScore: number;
  riskLevel: string;
  riskAction: string;
  requiresReauth: boolean;
  isBlocked: boolean;
  trainingProgress: number;
}

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [sessionId] = useState(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) return stored;
    const id = nanoid(32);
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  });

  const [riskState, setRiskState] = useState<RiskState>({
    anomalyScore: 0,
    riskLevel: "LOW",
    riskAction: "Allow",
    requiresReauth: false,
    isBlocked: false,
    trainingProgress: 0,
  });

  const [riskHistory, setRiskHistory] = useState<Array<{ time: string; score: number }>>([]);
  const [showReauth, setShowReauth] = useState(false);
  const [reauthPw, setReauthPw] = useState("");
  const [activityText, setActivityText] = useState("");

  const reauthMutation = trpc.behavior.reAuthenticate.useMutation({
    onSuccess: () => {
      toast.success("Re-authenticated successfully");
      setShowReauth(false);
      setReauthPw("");
      setRiskState(prev => ({
        ...prev,
        riskLevel: "LOW",
        anomalyScore: 0,
        requiresReauth: false,
        isBlocked: false,
        riskAction: "Allow",
      }));
    },
    onError: (err) => toast.error(err.message),
  });

  const historyQuery = trpc.behavior.getRiskHistory.useQuery({ limit: 30 });

  const handleRiskUpdate = useCallback((data: RiskState) => {
    setRiskState(data);
    if (data.requiresReauth || data.isBlocked) {
      setShowReauth(true);
    }
    const now = new Date().toLocaleTimeString();
    setRiskHistory(prev => [...prev.slice(-19), { time: now, score: Math.round(data.anomalyScore * 100) }]);
    
    if (data.riskLevel === "HIGH") toast.warning("⚠️ Unusual behavior detected – re-authentication required");
    if (data.riskLevel === "CRITICAL") toast.error("🚨 Critical anomaly – session at risk");
  }, []);

  useBehaviorCollector(sessionId, isAuthenticated, handleRiskUpdate);

  // No redirect here - let the page handle unauthenticated state gracefully

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          Loading...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-slate-400">Session expired. Please sign in again.</p>
          <button
            onClick={() => { window.location.href = '/login'; }}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleReauth = (e: React.FormEvent) => {
    e.preventDefault();
    reauthMutation.mutate({ sessionId, password: reauthPw });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Fingerprint className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="font-semibold text-sm">BioAuth Dashboard</div>
              <div className="text-xs text-slate-500">Welcome, {user.name}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${getRiskBg(riskState.riskLevel)} ${getRiskColor(riskState.riskLevel)}`}>
              <RiskIcon level={riskState.riskLevel} />
              {riskState.riskLevel}
            </div>
            {(user as any).role === "admin" && (
              <Button variant="outline" size="sm" onClick={() => navigate("/admin")} className="border-slate-700 text-slate-300 hover:bg-slate-800">
                Admin
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-slate-400 hover:text-red-400 hover:bg-red-400/10">
              <LogOut className="w-4 h-4 mr-1" /> Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Re-auth modal */}
      {showReauth && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm border-orange-500/50 bg-slate-900 shadow-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-400">
                <AlertTriangle className="w-5 h-5" />
                Re-Authentication Required
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-400 text-sm mb-4">
                Unusual behavior was detected. Please confirm your password to continue.
              </p>
              <form onSubmit={handleReauth} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Password</Label>
                  <Input
                    type="password"
                    value={reauthPw}
                    onChange={e => setReauthPw(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoFocus
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
                <div className="flex gap-3">
                  <Button type="submit" className="flex-1 bg-orange-600 hover:bg-orange-500" disabled={reauthMutation.isPending}>
                    {reauthMutation.isPending ? "Verifying..." : "Verify Identity"}
                  </Button>
                  <Button type="button" variant="outline" className="border-slate-700" onClick={handleLogout}>
                    Logout
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Training progress banner */}
        {riskState.trainingProgress < 100 && (
          <div className="p-4 rounded-xl bg-blue-950/50 border border-blue-800/50 flex items-center gap-3">
            <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
            <div className="flex-1">
              <div className="text-sm text-blue-300 font-medium">Building your behavioral profile...</div>
              <div className="text-xs text-blue-400/70 mt-0.5">
                {Math.round(riskState.trainingProgress)}% complete — continue using the app to train your profile
              </div>
              <div className="mt-2 h-1.5 bg-blue-900/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${riskState.trainingProgress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Risk metrics grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "Risk Score",
              value: `${(riskState.anomalyScore * 100).toFixed(1)}%`,
              icon: <Activity className="w-5 h-5" />,
              color: getRiskColor(riskState.riskLevel),
            },
            {
              label: "Risk Level",
              value: riskState.riskLevel,
              icon: <Shield className="w-5 h-5" />,
              color: getRiskColor(riskState.riskLevel),
            },
            {
              label: "Action",
              value: riskState.riskAction,
              icon: <CheckCircle className="w-5 h-5" />,
              color: "text-slate-300",
            },
            {
              label: "Profile",
              value: `${Math.round(riskState.trainingProgress)}%`,
              icon: <Fingerprint className="w-5 h-5" />,
              color: "text-blue-400",
            },
          ].map(m => (
            <Card key={m.label} className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4">
                <div className={`flex items-center gap-2 ${m.color} mb-1`}>
                  {m.icon}
                  <span className="text-xs text-slate-400">{m.label}</span>
                </div>
                <div className={`text-xl font-bold ${m.color}`}>{m.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Risk score chart */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                Live Anomaly Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              {riskHistory.length > 1 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={riskHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#64748b" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
                      labelStyle={{ color: "#94a3b8" }}
                      itemStyle={{ color: "#60a5fa" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      name="Anomaly %"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-40 flex items-center justify-center text-slate-600 text-sm">
                  Data will appear after 10s of activity
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity box */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-blue-400" />
                Behavioral Collection Test Area
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-slate-500">
                Type or move your mouse here to generate behavioral data. A batch is sent every 10 seconds.
              </p>
              <textarea
                className="w-full h-28 bg-slate-800 border border-slate-700 rounded-lg p-3 text-slate-200 text-sm resize-none focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
                placeholder="Start typing anything here to generate behavioral data for analysis..."
                value={activityText}
                onChange={e => setActivityText(e.target.value)}
              />
              <div className="flex gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Keyboard className="w-3 h-3" />
                  Keystroke timing collected (no characters stored)
                </span>
                <span className="flex items-center gap-1">
                  <MousePointer className="w-3 h-3" />
                  Mouse dynamics collected
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent events */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              Recent Behavior Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            {historyQuery.data && historyQuery.data.length > 0 ? (
              <div className="space-y-2">
                {historyQuery.data.slice(0, 10).map(event => (
                  <div key={event.id} className={`flex items-center justify-between p-3 rounded-lg border ${getRiskBg(event.riskLevel ?? "LOW")}`}>
                    <div className="flex items-center gap-3">
                      <RiskIcon level={event.riskLevel ?? "LOW"} />
                      <div>
                        <div className={`text-sm font-medium ${getRiskColor(event.riskLevel ?? "LOW")}`}>
                          {event.riskLevel ?? "LOW"} — {event.riskAction ?? "Allow"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {new Date(event.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-mono ${getRiskColor(event.riskLevel ?? "LOW")}`}>
                        {((event.anomalyScore ?? 0) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-600 text-sm">
                No events yet — start using the activity area above
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
