# AI Gallery

A waterfall feed of community photo stories inspired by Xiaohongshu. Generate AI-powered images using Google Gemini and share them with the community.

## Features

- **AI Image Generation**: Create unique images using Google Gemini with customizable prompts, aspect ratios, and resolutions
- **Real-time Streaming**: Watch the AI think and generate images in real-time with SSE (Server-Sent Events)
- **Reference Images**: Upload up to 8 reference images to guide the AI generation
- **Community Gallery**: Browse and discover AI-generated stories in a beautiful waterfall feed
- **GitHub Authentication**: Sign in with GitHub to create and manage your stories
- **Dark/Light Mode**: Toggle between themes for comfortable viewing
- **Responsive Design**: Optimized for both desktop and mobile devices

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org) with App Router and Turbopack
- **Frontend**: React 19, TypeScript, Tailwind CSS 4
- **Styling**: Custom CSS variables with glassmorphism design
- **AI Integration**: Google Gemini API for image generation
- **Authentication**: GitHub OAuth
- **Markdown**: react-markdown with typewriter animation effect

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/ai-gallery.git
cd ai-gallery

# Install dependencies
npm install
```

### Environment Variables

Create a `.env.local` file with the following variables:

```env
# API Configuration
NEXT_PUBLIC_API_URL=your_api_url

# R2 Storage (for image previews)
NEXT_PUBLIC_R2_PUBLIC_URL=your_r2_public_url

# GitHub OAuth (for local development)
GITHUB_CLIENT_ID=your_github_client_id
```

### Development

Run the Next.js development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Home page - Gallery feed
│   ├── article/           # Article detail page
│   ├── generate/          # AI image generation playground
│   └── auth/              # GitHub OAuth callback
├── components/            # Reusable UI components
│   ├── article-card.tsx   # Gallery card component
│   ├── auth-status.tsx    # Authentication status display
│   ├── theme-toggle.tsx   # Dark/light mode toggle
│   └── stable-markdown-typewriter.tsx
├── hooks/                 # Custom React hooks
├── lib/                   # Utility functions and API clients
│   ├── http.ts           # HTTP utilities
│   ├── client-session.ts # Session management
│   ├── gemini.ts         # Gemini API types
│   └── uploads-client.ts # File upload utilities
└── types/                # TypeScript type definitions
```

## Pages

### Home (`/`)
The main gallery page displaying a waterfall feed of community stories with infinite scroll.

### Generate (`/generate`)
The AI playground where authenticated users can:
- Write prompts describing the desired image
- Upload reference images for style guidance
- Configure aspect ratio (1:1, 4:5, 3:4, 16:9, 21:9)
- Choose resolution (1K, 2K, 4K)
- Watch real-time generation with AI narration

### Article Detail (`/article?id=...`)
View individual stories with:
- Image gallery with swipe navigation
- Author information
- Prompt details
- Visibility controls (for story owners)

## Scripts

```bash
npm run dev      # Start development server with Turbopack
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com)
- [Google Gemini API](https://ai.google.dev)

## License

MIT
