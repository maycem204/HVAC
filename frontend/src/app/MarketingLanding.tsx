import {
  ArrowRight, Bot, CalendarCheck, Check, CheckCircle2, Clock3,
  Coins, Globe2, Languages, MapPin, ShieldCheck, Sparkles, TrendingUp,
  Wrench, X, Zap,
} from "lucide-react";
import type { Role } from "./domain";

export function MarketingLanding({ onSelect }: { onSelect: (role: Role) => void }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-foreground">
      <nav className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="#top" className="flex items-center gap-2.5" aria-label="QuoteAI — accueil">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-sm shadow-blue-200">
              <Zap className="h-4.5 w-4.5 text-white"/>
            </span>
            <span className="text-lg font-bold tracking-tight">QuoteAI</span>
          </a>

          <div className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#pricing" className="transition-colors hover:text-foreground">Pricing</a>
            <a href="#about" className="transition-colors hover:text-foreground">About</a>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={()=>onSelect("client")} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 sm:px-4 sm:text-sm">
              Espace client
            </button>
            <button onClick={()=>onSelect("technician")} className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-[10px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 sm:px-4 sm:text-sm">
              Espace technicien
            </button>
          </div>
        </div>
      </nav>

      <main id="top">
        <section className="relative isolate overflow-hidden">
          <div className="absolute inset-x-0 top-0 -z-10 h-[620px] bg-[radial-gradient(circle_at_20%_20%,rgba(37,99,235,0.13),transparent_36%),radial-gradient(circle_at_80%_25%,rgba(16,185,129,0.11),transparent_32%)]"/>
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1.02fr_.98fr] lg:px-8 lg:py-32">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                <Globe2 className="h-3.5 w-3.5"/> Built for the MENA HVAC market
              </div>
              <h1 className="max-w-3xl text-4xl font-black leading-[1.08] tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-6xl">
                Generate HVAC quotes in seconds with AI
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
                AI-powered HVAC estimates adapted to MENA markets, local currencies, and regional service realities. Describe the issue and connect with the right available specialist—without waiting for callbacks.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button onClick={()=>onSelect("client")} className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-white shadow-lg shadow-blue-200 transition-all hover:-translate-y-0.5 hover:bg-primary/90">
                  Get a quote <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1"/>
                </button>
                <a href="#features" className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  See how it works
                </a>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-slate-500">
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500"/>Instant estimate</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500"/>Local currency</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500"/>Qualified specialists</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl">
              <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-blue-100/80 to-emerald-100/60 blur-2xl"/>
              <div className="overflow-hidden rounded-3xl border border-white bg-white shadow-2xl shadow-slate-200/80">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50"><Bot className="h-4.5 w-4.5 text-primary"/></div>
                    <div><div className="text-sm font-bold">AI quote assistant</div><div className="text-[11px] text-emerald-600">Online · replies instantly</div></div>
                  </div>
                  <ShieldCheck className="h-5 w-5 text-slate-400"/>
                </div>
                <div className="space-y-4 bg-slate-50/70 p-5">
                  <div className="max-w-[88%] rounded-2xl rounded-tl-md bg-white p-3.5 text-sm leading-6 text-slate-600 shadow-sm">
                    Tell me what is happening with your HVAC equipment.
                  </div>
                  <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-md bg-primary p-3.5 text-sm leading-6 text-white">
                    My split AC makes a loud noise when it starts.
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">ESTIMATED QUOTE</span>
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">High confidence</span>
                    </div>
                    <div className="text-3xl font-black tracking-tight text-slate-950">139.05 <span className="text-base font-bold text-slate-500">TND</span></div>
                    <div className="mt-1 text-xs text-slate-500">Estimated range: 127.93–150.17 TND</div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-[88%] rounded-full bg-emerald-500"/></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-100 bg-white p-3"><Clock3 className="mb-2 h-4 w-4 text-blue-600"/><div className="text-xs font-bold">Next available</div><div className="mt-0.5 text-[11px] text-slate-500">Today, 14:00</div></div>
                    <div className="rounded-xl border border-slate-100 bg-white p-3"><MapPin className="mb-2 h-4 w-4 text-emerald-600"/><div className="text-xs font-bold">Nearest specialist</div><div className="mt-0.5 text-[11px] text-slate-500">400 m away</div></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-slate-100 bg-white py-10">
          <div className="mx-auto grid max-w-7xl gap-4 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
            {[
              {Icon:Coins,title:"Local market pricing",text:"Estimates use regional HVAC data and display the appropriate local currency."},
              {Icon:Languages,title:"Arabic, French & English",text:"A clearer customer journey across the languages most used throughout MENA."},
              {Icon:MapPin,title:"Location-aware matching",text:"Clients find qualified nearby technicians within their actual service area."},
            ].map(({Icon,title,text})=>(
              <div key={title} className="flex items-start gap-3 rounded-2xl p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50"><Icon className="h-4.5 w-4.5 text-primary"/></div>
                <div><h2 className="text-sm font-bold text-slate-900">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="border-y border-slate-100 bg-slate-50/70 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary">From friction to clarity</span>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Quoting should not slow your business down</h2>
            </div>
            <div className="mt-14 grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-red-100 bg-white p-6 sm:p-8">
                <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-red-50"><X className="h-5 w-5 text-red-500"/></div>
                <h3 className="text-xl font-bold">The old way</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">Slow, manual, and error-prone quotes cost time and create uncertainty for everyone.</p>
                <div className="mt-6 space-y-3">
                  {["Repeated calls and incomplete descriptions","Inconsistent pricing and manual calculations","Hours lost finding the right available technician"].map((item)=><div key={item} className="flex items-start gap-3 rounded-xl bg-red-50/60 p-3 text-sm text-slate-600"><X className="mt-0.5 h-4 w-4 shrink-0 text-red-400"/>{item}</div>)}
                </div>
              </div>
              <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm sm:p-8">
                <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50"><Zap className="h-5 w-5 text-emerald-600"/></div>
                <h3 className="text-xl font-bold">The QuoteAI way</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">Instant AI-powered pricing turns a clear issue description into an actionable service request adapted to the customer’s MENA market.</p>
                <div className="mt-6 space-y-3">
                  {["Context-aware HVAC issue clarification","Transparent estimates in the correct local currency","Nearby specialists ranked by skill and availability"].map((item)=><div key={item} className="flex items-start gap-3 rounded-xl bg-emerald-50/60 p-3 text-sm text-slate-700"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"/>{item}</div>)}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-5 md:grid-cols-3">
              {[
                {Icon:Bot,title:"Describe the issue",text:"The multilingual assistant asks useful questions and keeps the full context of the conversation."},
                {Icon:TrendingUp,title:"Receive a local estimate",text:"Pricing uses regional HVAC data, location, complexity, and urgency—not guesswork."},
                {Icon:CalendarCheck,title:"Book the right specialist",text:"See nearby qualified technicians and their earliest compatible availability."},
              ].map(({Icon,title,text},index)=>(
                <div key={title} className="rounded-2xl border border-slate-100 p-6 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-100">
                  <div className="mb-5 flex items-center justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50"><Icon className="h-5 w-5 text-primary"/></div><span className="text-xs font-black text-slate-300">0{index+1}</span></div>
                  <h3 className="font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="bg-slate-950 py-20 text-white sm:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-blue-400">MENA-ready pricing</span>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Regional pricing clients can understand</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">QuoteAI adapts the estimate to the customer’s market and displays the currency, price range, and confidence clearly. The final intervention price remains visible throughout the service workflow.</p>
            </div>
            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 sm:p-8">
              <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/15"><Sparkles className="h-5 w-5 text-blue-400"/></div><div><div className="font-bold">Start with an AI estimate</div><div className="text-xs text-slate-400">No phone call required</div></div></div>
              <div className="mt-6 space-y-3 text-sm text-slate-300">
                {["Price range in your local currency","Specialists matched to the actual HVAC issue","Available appointment options before confirmation"].map((item)=><div key={item} className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-emerald-400"/>{item}</div>)}
              </div>
              <button onClick={()=>onSelect("client")} className="mt-7 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-bold text-slate-950 hover:bg-blue-50">Try now <ArrowRight className="h-4 w-4"/></button>
            </div>
          </div>
        </section>

        <section id="about" className="py-20 sm:py-24">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50"><Wrench className="h-5 w-5 text-emerald-600"/></div>
            <h2 className="mt-5 text-3xl font-black tracking-tight text-slate-950">A professional HVAC platform dedicated to MENA</h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-600">Designed around the region’s languages, currencies, geography, and HVAC service needs. Clients gain speed and clarity while technicians manage relevant requests, pricing, availability, appointments, and conversations from one workspace.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button onClick={()=>onSelect("client")} className="h-11 rounded-xl bg-primary px-5 text-sm font-bold text-white hover:bg-primary/90">Get a quote</button>
              <button onClick={()=>onSelect("technician")} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Join as a technician</button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-100 bg-slate-50 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-xs text-slate-500 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary"/><span className="font-bold text-slate-700">QuoteAI</span></div>
          <span>Professional HVAC quoting, matching, and scheduling for the MENA region.</span>
        </div>
      </footer>
    </div>
  );
}
