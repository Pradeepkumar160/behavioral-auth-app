import { useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Shield, Users, Activity, LogOut, XCircle,
  AlertTriangle, CheckCircle, Clock, Fingerprint
} from "lucide-react";

function getRiskColor(level: string) {
  switch (level) {
    case "LOW": return "text-green-400";
    case "MEDIUM": return "text-yellow-400";
    case "HIGH": return "text-orange-400";
    case "CRITICAL": return "text-red-400";
    default: return "text-slate-400";
  }
}

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    LOW: "bg-green-400/10 text-green-400 border-green-500/30",
    MEDIUM: "bg-yellow-400/10 text-yellow-400 border-yellow-500/30",
    HIGH: "bg-orange-400/10 text-orange-400 border-orange-500/30",
    CRITICAL: "bg-red-400/10 text-red-400 border-red-500/30",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors[level] ?? colors.LOW}`}>
      {level}
    </span>
  );
}

export default function AdminPage() {
  const [, navigate] = useLocation();
  const { user, loading, logout } = useAuth();

  const sessionsQuery = trpc.behavior.admin.activeSessions.useQuery(undefined, {
    refetchInterval: 10_000,
  });
  const logsQuery = trpc.behavior.admin.behaviorLogs.useQuery({ limit: 50 }, {
    refetchInterval: 15_000,
  });
  const terminateMutation = trpc.behavior.admin.terminateSession.useMutation({
    onSuccess: () => {
      toast.success("Session terminated");
      sessionsQuery.refetch();
    },
    onError: err => toast.error(err.message),
  });

  useEffect(() => {
    if (!loading && (!user || (user as any).role !== "admin")) {
      toast.error("Admin access required");
      navigate("/dashboard");
    }
  }, [loading, user, navigate]);

  if (loading || !user) {
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

  const sessions = sessionsQuery.data ?? [];
  const logs = logsQuery.data ?? [];
  const activeSessions = sessions.filter(s => s.isActive && !s.isBlocked);
  const highRisk = sessions.filter(s => s.riskLevel === "HIGH" || s.riskLevel === "CRITICAL");

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="font-semibold text-sm">Admin Console</div>
              <div className="text-xs text-slate-500">Behavioral Biometrics Monitor</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")} className="border-slate-700 text-slate-300">
              Dashboard
            </Button>
            <Button variant="ghost" size="sm" onClick={async () => { await logout(); navigate("/login"); }} className="text-slate-400 hover:text-red-400 hover:bg-red-400/10">
              <LogOut className="w-4 h-4 mr-1" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Active Sessions", value: activeSessions.length, icon: <Users className="w-5 h-5 text-blue-400" />, color: "text-blue-400" },
            { label: "Total Sessions", value: sessions.length, icon: <Activity className="w-5 h-5 text-slate-400" />, color: "text-slate-300" },
            { label: "High Risk", value: highRisk.length, icon: <AlertTriangle className="w-5 h-5 text-orange-400" />, color: "text-orange-400" },
            { label: "Behavior Events", value: logs.length, icon: <Fingerprint className="w-5 h-5 text-purple-400" />, color: "text-purple-400" },
          ].map(s => (
            <Card key={s.label} className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  {s.icon}
                  <span className="text-xs text-slate-500">{s.label}</span>
                </div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Active Sessions Table */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-sm text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                Active Sessions
              </span>
              <Button variant="ghost" size="sm" onClick={() => sessionsQuery.refetch()} className="text-slate-500 hover:text-slate-300">
                <svg className={`w-3 h-3 mr-1 ${sessionsQuery.isFetching ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24">
                  <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                Refresh
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <div className="text-center py-8 text-slate-600 text-sm">No active sessions</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 text-xs border-b border-slate-800">
                      <th className="pb-2 pr-4">Session ID</th>
                      <th className="pb-2 pr-4">User ID</th>
                      <th className="pb-2 pr-4">Risk Level</th>
                      <th className="pb-2 pr-4">Score</th>
                      <th className="pb-2 pr-4">Action</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">Last Activity</th>
                      <th className="pb-2">Terminate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {sessions.map(s => (
                      <tr key={s.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 pr-4 font-mono text-xs text-slate-400">{s.sessionId.slice(0, 12)}...</td>
                        <td className="py-2.5 pr-4 text-slate-300">{s.userId}</td>
                        <td className="py-2.5 pr-4"><RiskBadge level={s.riskLevel ?? "LOW"} /></td>
                        <td className={`py-2.5 pr-4 font-mono ${getRiskColor(s.riskLevel ?? "LOW")}`}>
                          {((s.currentRiskScore ?? 0) * 100).toFixed(1)}%
                        </td>
                        <td className="py-2.5 pr-4 text-slate-400 text-xs">{s.riskAction}</td>
                        <td className="py-2.5 pr-4">
                          {s.isBlocked ? (
                            <span className="flex items-center gap-1 text-red-400 text-xs"><XCircle className="w-3 h-3" />Blocked</span>
                          ) : s.requiresReauth ? (
                            <span className="flex items-center gap-1 text-orange-400 text-xs"><AlertTriangle className="w-3 h-3" />Re-auth</span>
                          ) : s.isActive ? (
                            <span className="flex items-center gap-1 text-green-400 text-xs"><CheckCircle className="w-3 h-3" />Active</span>
                          ) : (
                            <span className="flex items-center gap-1 text-slate-500 text-xs"><Clock className="w-3 h-3" />Inactive</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-xs text-slate-500">
                          {new Date(s.lastActivityTime).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => terminateMutation.mutate({ sessionId: s.sessionId, targetUserId: s.userId })}
                            disabled={terminateMutation.isPending || !s.isActive}
                            className="text-red-400 hover:text-red-300 hover:bg-red-400/10 h-7 px-2 text-xs"
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Terminate
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Behavior Logs */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" />
              Behavior Event Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <div className="text-center py-8 text-slate-600 text-sm">No behavior events recorded yet</div>
            ) : (
              <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                {logs.map(log => (
                  <div key={log.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/50 text-xs">
                    <div className="flex items-center gap-3">
                      <RiskBadge level={log.riskLevel ?? "LOW"} />
                      <span className="text-slate-400">User {log.userId}</span>
                      <span className="text-slate-600 font-mono">{log.sessionId.slice(0, 8)}...</span>
                    </div>
                    <div className="flex items-center gap-4 text-slate-500">
                      <span className={`font-mono ${getRiskColor(log.riskLevel ?? "LOW")}`}>
                        {((log.anomalyScore ?? 0) * 100).toFixed(1)}%
                      </span>
                      <span>{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
