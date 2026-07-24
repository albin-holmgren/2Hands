import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const alt = '2Hands - AI Agent Manager'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #FFFFFF 0%, #F5F3F0 50%, #FAFAFA 100%)',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        {/* Decorative gradient orbs */}
        <div
          style={{
            position: 'absolute',
            top: '-100px',
            right: '-100px',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(255,182,193,0.3) 0%, rgba(255,218,185,0.3) 100%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-100px',
            left: '-100px',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(173,216,230,0.3) 0%, rgba(221,160,221,0.3) 100%)',
            filter: 'blur(60px)',
          }}
        />

        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            marginBottom: '40px',
          }}
        >
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '20px',
              background: '#34322D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '40px',
              color: 'white',
              fontWeight: 700,
            }}
          >
            2
          </div>
          <span
            style={{
              fontSize: '56px',
              fontWeight: 600,
              color: '#34322D',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            2HANDS
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: '36px',
            fontWeight: 500,
            color: '#34322D',
            marginBottom: '16px',
            textAlign: 'center',
          }}
        >
          AI Agent Manager
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: '24px',
            color: '#75736F',
            textAlign: 'center',
            maxWidth: '800px',
            lineHeight: 1.4,
          }}
        >
          Delegate complex computer tasks to autonomous AI agents
          <br />
          that work 24/7 on virtual machines.
        </div>

        {/* Feature pills */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            marginTop: '48px',
          }}
        >
          {['Web Research', 'Email Automation', 'Data Entry', '24/7 Operation'].map((feature) => (
            <div
              key={feature}
              style={{
                padding: '12px 24px',
                borderRadius: '100px',
                background: 'rgba(52, 50, 45, 0.08)',
                fontSize: '18px',
                color: '#34322D',
                fontWeight: 500,
              }}
            >
              {feature}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
