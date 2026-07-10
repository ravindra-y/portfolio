# RAVINDRA - PORTFOLIO

```
  ____      ___     _____ _   _ ____  ____      _              ____   ___  ____ _____ _____ ___  _     ___ ___
 |  _ \    / \ \   / /_ _| \ | |  _ \|  _ \    / \            |  _ \ / _ \|  _ \_   _|  ___/ _ \| |   |_ _/ _ \
 | |_) |  / _ \ \ / / | ||  \| | | | | |_) |  / _ \    _____  | |_) | | | | |_) || | | |_ | | | | |    | | | | |
 |  _ <  / ___ \ V /  | || |\  | |_| |  _ <  / ___ \  |_____| |  __/| |_| |  _ < | | |  _|| |_| | |___ | | |_| |
 |_| \_\/_/   \_\_/  |___|_| \_|____/|_| \_\/_/   \_\         |_|    \___/|_| \_\|_| |_|   \___/|_____|___\___/

>> SYSTEM_STATUS: ONLINE
>> THEME: NEO_BRUTALISM
>> VERSION: 1.0.0
```

> **WARNING**: This is NOT a standard portfolio. It is a raw, unfiltered expression of code. No cookies. No trackers. Just pure HTML, CSS, and JS anarchy.

---

## /// MANIFESTO

**Design is dying.** The web has become a sea of identical, sanitized templates. We are here to break the grid.
This portfolio embraces **Neo-Brutalism**:

- High Contrast
- Raw Typography
- Asymmetrical Layouts
- "Ugly" on Purpose

It's not about being pretty. It's about being **BOLD**.

---

## /// TECH_STACK

| COMPONENT     | TECHNOLOGY                                  | STATUS      |
| :------------ | :------------------------------------------ | :---------- |
| **CORE**      | `HTML5`                                     | [OPTIMIZED] |
| **STYLING**   | `TailwindCSS`                               | [LOADED]    |
| **SCRIPTING** | `Vanilla JS`                                | [ACTIVE]    |
| **APIs**      | `GitHub API` + `LeetCode APIs` + `LeetCard` | [STREAMING] |
| **ICONS**     | `Remix Icons`                               | [LINKED]    |
| **FONTS**     | `Space Grotesk` + `JetBrains Mono`          | [IMPORTED]  |

---

## /// FEATURES_LOG

### 01. CUSTOM_CURSOR

> A custom-built cursor that reacts to interactive elements.
>
> - **Normal State**: Small crosshair/dot.
> - **Hover State**: Expands to a Neo-Yellow block with black borders.

### 02. GLITCH_EFFECTS

> CSS-only glitch animations on hover states.
>
> - `mix-blend-mode: difference` for high contrast.
> - Random translation keyframes for that "broken" feel.

### 03. MARQUEE_SCROLL

> Infinite scrolling text banners.
>
> - Pure CSS animation.
> - **Direction**: Left-to-Right & Right-to-Left.

### 04. REVEAL_ANIMATION

> Elements reveal themselves as you scroll.
>
> - `IntersectionObserver` API.
> - Smooth translate-Y transitions.

### 05. CODING_STATS_INTEGRATION

> Real-time data visualization of development activity.
>
> - **Dual-Profile Interface**: Side-by-side GitHub and LeetCode stats.
> - **Live GitHub API**: Dynamic fetching of Repos, Followers, and Commits.
> - **LeetCard Integration**: Real-time LeetCode problem-solving heatmap.
> - **Resilient Badge Sync**: Badge API with cached and stats-based fallback when rate-limited.
> - **Parallel Layout**: Perfectly balanced columns with mirrored headers and activity matrices.

---

## /// FILE_STRUCTURE

```bash
.
├── assets/
│   ├── images/          # [DIR] Project thumbnails & avatar
│   ├── icons/           # [DIR] Site icons (favicon, social preview)
│   └── resume/          # [DIR] CV PDF file
├── .env.example         # [FILE] Backend mail configuration template
├── index.html           # [FILE] Main Entry Point
├── package.json         # [FILE] Node server dependencies/scripts
├── server.js            # [FILE] Express API + static hosting
└── README.md            # [FILE] You are here
```

## /// OWNED_CONTACT_BACKEND

The contact form now posts to your own backend route: `POST /api/contact`.

### 01. SETUP

1. Install dependencies:

- `npm install`

2. Create env file:

- `copy .env.example .env`

3. Fill SMTP values in `.env`:

- `SMTP_HOST`
- `SMTP_PORT` - use `465` for implicit TLS on Render/Gmail
- `SMTP_SECURE` - set to `true` when using port `465`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_TO`
- `MAIL_FROM`

### 02. RUN

1. Start server:

- `npm run dev`

2. Open:

- `http://localhost:3000`

### 03. HEALTHCHECK

Visit `http://localhost:3000/health` to confirm env wiring.
If any env vars are missing, the response lists them in `missingEnv`.

## /// CONTACT_COORDINATES

**TRANSMISSION OPEN:**

- **MAIL**: `ravindray.dev@gmail.com`
- **GITHUB**: `ravindra-y`
- **LOCATION**: `Remote / Earth`

> "I build digital products that refuse to be boring."

---

**© 2025 RAVINDRA.exe // SYSTEM_END**
