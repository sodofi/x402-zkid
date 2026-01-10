'use client'

import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useState, useEffect } from 'react'
import { generateZKProof, verifyZKProof, ProofData } from '@/lib/zkproof'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function Home() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy()
  const { wallets } = useWallets()
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Welcome to x402 ZKID! You are now authenticated. Your identity has been verified and bound to your wallet. You can download your ZK proof above, or start negotiating below.',
    },
  ])
  const [input, setInput] = useState('')
  const [zkProof, setZkProof] = useState<ProofData | null>(null)
  const [isGeneratingProof, setIsGeneratingProof] = useState(false)
  const [proofError, setProofError] = useState<string | null>(null)
  const [isVerified, setIsVerified] = useState<boolean | null>(null)

  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy')

  useEffect(() => {
    if (authenticated && user && embeddedWallet?.address) {
      generateProof()
    }
  }, [authenticated, user, embeddedWallet?.address])

  const generateProof = async () => {
    if (!user || !embeddedWallet?.address) return

    setIsGeneratingProof(true)
    setProofError(null)
    setIsVerified(null)

    try {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        throw new Error('Failed to get access token')
      }

      // Decode JWT to extract claims
      const parts = accessToken.split('.')
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format')
      }

      const payload = JSON.parse(atob(parts[1]))

      // Extract email from linked accounts
      const googleAccount = user.linkedAccounts?.find(
        (account) => account.type === 'google_oauth'
      )
      const email = googleAccount?.email || user.email?.address || null
      const domain = email ? email.split('@')[1] : 'unknown'

      // Generate real ZK proof using snarkjs
      const proof = await generateZKProof(
        domain,
        embeddedWallet.address,
        payload.exp
      )

      setZkProof(proof)

      // Verify the proof
      const verified = await verifyZKProof(proof)
      setIsVerified(verified)
      console.log('Proof verification result:', verified)

    } catch (error) {
      console.error('Failed to generate proof:', error)
      setProofError(
        error instanceof Error ? error.message : 'Failed to generate proof'
      )

      // Check if it's a missing circuit files error
      if (error instanceof Error && error.message.includes('fetch')) {
        setProofError(
          'Circuit files not found. Please run: cd circuits && pnpm install && pnpm build'
        )
      }
    } finally {
      setIsGeneratingProof(false)
    }
  }

  const downloadProof = () => {
    if (!zkProof) return

    const blob = new Blob([JSON.stringify(zkProof, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `zkid-proof-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const downloadRawJwt = async () => {
    const accessToken = await getAccessToken()
    if (!accessToken) return

    const blob = new Blob([accessToken], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `privy-jwt-${Date.now()}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleSend = () => {
    if (!input.trim()) return

    const userMessage: Message = { role: 'user', content: input }
    setMessages((prev) => [...prev, userMessage])
    setInput('')

    // Simulate assistant response (placeholder for Fireworks AI integration)
    setTimeout(() => {
      const assistantMessage: Message = {
        role: 'assistant',
        content: `I received your message: "${input}". This is a placeholder response. The negotiation system will be connected to Fireworks AI for actual price negotiations.`,
      }
      setMessages((prev) => [...prev, assistantMessage])
    }, 500)
  }

  if (!ready) {
    return <div className="loading">Loading...</div>
  }

  if (!authenticated) {
    return (
      <div className="login-container">
        <h1>x402 ZKID</h1>
        <p>
          Authenticate with your Google account to generate a zero-knowledge proof
          binding your identity to an embedded wallet.
        </p>
        <button className="btn btn-primary" onClick={login}>
          Sign in with Google
        </button>
      </div>
    )
  }

  const email =
    user?.linkedAccounts?.find((a) => a.type === 'google_oauth')?.email ||
    user?.email?.address ||
    'Unknown'

  return (
    <div className="container">
      <header className="header">
        <h1>x402 ZKID</h1>
        <div className="user-info">
          <span className="user-email">{email}</span>
          {embeddedWallet && (
            <span className="wallet-address">
              {embeddedWallet.address.slice(0, 6)}...{embeddedWallet.address.slice(-4)}
            </span>
          )}
          <button className="btn btn-secondary" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <section className="proof-section">
        <h2>Identity Proof (Groth16)</h2>
        {isGeneratingProof ? (
          <div style={{ color: 'var(--text-secondary)' }}>
            <p>Generating ZK proof...</p>
            <p style={{ fontSize: '0.8rem' }}>This may take a few seconds</p>
          </div>
        ) : proofError ? (
          <div style={{ color: '#ef4444' }}>
            <p>Error: {proofError}</p>
            <button className="btn btn-secondary" onClick={generateProof} style={{ marginTop: '1rem' }}>
              Retry
            </button>
          </div>
        ) : zkProof ? (
          <>
            <div className="proof-info">
              <div className="proof-item">
                <label>Status</label>
                <span className={`status-badge ${isVerified ? 'status-verified' : 'status-pending'}`}>
                  {isVerified === null ? 'Verifying...' : isVerified ? 'Verified' : 'Invalid'}
                </span>
              </div>
              <div className="proof-item">
                <label>Domain</label>
                <span>{zkProof.domain}</span>
              </div>
              <div className="proof-item">
                <label>Wallet</label>
                <span style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                  {zkProof.walletAddress}
                </span>
              </div>
              <div className="proof-item">
                <label>Protocol</label>
                <span>{zkProof.proof.protocol} / {zkProof.proof.curve}</span>
              </div>
              <div className="proof-item">
                <label>Generated</label>
                <span>
                  {new Date(zkProof.generatedAt).toLocaleString()}
                </span>
              </div>
              <div className="proof-item">
                <label>Public Signals</label>
                <span style={{ fontSize: '0.7rem', fontFamily: 'monospace' }}>
                  {zkProof.publicSignals.length} signals
                </span>
              </div>
            </div>
            <div className="proof-actions">
              <button className="btn btn-primary" onClick={downloadProof}>
                Download Proof
              </button>
              <button className="btn btn-secondary" onClick={downloadRawJwt}>
                Download Raw JWT
              </button>
              <button className="btn btn-secondary" onClick={generateProof}>
                Regenerate
              </button>
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--text-secondary)' }}>
            <p>Waiting for wallet...</p>
          </div>
        )}
      </section>

      <div className="chat-container">
        <div className="messages">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`message ${
                msg.role === 'user' ? 'message-user' : 'message-assistant'
              }`}
            >
              {msg.content}
            </div>
          ))}
        </div>
        <div className="input-container">
          <input
            type="text"
            placeholder="Start negotiating..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button className="btn btn-primary" onClick={handleSend}>
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
