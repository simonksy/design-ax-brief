/* @ds-bundle: {"format":3,"namespace":"VercelGeistDesignSystem_c2ba0d","components":[{"name":"Button","sourcePath":"components/buttons/Button.jsx"},{"name":"IconButton","sourcePath":"components/buttons/IconButton.jsx"},{"name":"Badge","sourcePath":"components/feedback/Badge.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Card","sourcePath":"components/surfaces/Card.jsx"},{"name":"CodeBlock","sourcePath":"components/surfaces/CodeBlock.jsx"}],"sourceHashes":{"components/buttons/Button.jsx":"1cfcb0683b26","components/buttons/IconButton.jsx":"2f4c226ec827","components/feedback/Badge.jsx":"1be6079af2ec","components/forms/Input.jsx":"f4faa7c8d840","components/surfaces/Card.jsx":"8daa341f66b8","components/surfaces/CodeBlock.jsx":"962439c2252b","ui_kits/marketing/CTA.jsx":"dceb86144765","ui_kits/marketing/Features.jsx":"8b2cc81bd749","ui_kits/marketing/Hero.jsx":"4f61d0651fe3","ui_kits/marketing/LogoStrip.jsx":"25d3d857162c","ui_kits/marketing/Nav.jsx":"f21924229e3e","ui_kits/marketing/Pricing.jsx":"bbbb349c93c2"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.VercelGeistDesignSystem_c2ba0d = window.VercelGeistDesignSystem_c2ba0d || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/buttons/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — Vercel Geist.
 * Two shapes by context: marketing CTAs are fully-rounded pills (size="lg"),
 * nav/app controls are tight 6px squares (size="sm"). Category tabs use a
 * 64px pill via variant="category".
 */
function Button({
  children,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  onClick,
  type = 'button',
  style = {},
  ...rest
}) {
  const isLg = size === 'lg';
  const isCategory = variant === 'category';
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-xs)',
    fontFamily: 'var(--font-sans)',
    fontWeight: 'var(--weight-medium)',
    fontSize: isLg ? 'var(--button-lg-size)' : 'var(--button-md-size)',
    lineHeight: isLg ? 'var(--button-lg-line)' : 'var(--button-md-line)',
    height: isLg ? '40px' : '32px',
    padding: isLg ? '0 14px' : '0 12px',
    border: '1px solid transparent',
    borderRadius: isCategory ? 'var(--radius-pill-category)' : isLg ? 'var(--radius-pill)' : 'var(--radius-sm)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease',
    textDecoration: 'none',
    opacity: disabled ? 0.4 : 1,
    userSelect: 'none'
  };
  const variants = {
    primary: {
      background: 'var(--ink)',
      color: 'var(--on-primary)',
      borderColor: 'var(--ink)'
    },
    secondary: {
      background: 'var(--canvas-elevated)',
      color: 'var(--text-ink)',
      borderColor: 'var(--hairline)'
    },
    ghost: {
      background: 'var(--canvas-elevated)',
      color: 'var(--text-ink)',
      borderColor: 'var(--hairline)'
    },
    category: {
      background: 'var(--canvas-elevated)',
      color: 'var(--text-ink)',
      borderColor: 'var(--hairline)'
    }
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled,
    onClick: onClick,
    style: {
      ...base,
      ...variants[variant],
      ...style
    },
    onMouseEnter: e => {
      if (disabled) return;
      if (variant === 'primary') e.currentTarget.style.opacity = '0.85';else e.currentTarget.style.borderColor = 'var(--text-faint)';
    },
    onMouseLeave: e => {
      if (disabled) return;
      if (variant === 'primary') e.currentTarget.style.opacity = '1';else e.currentTarget.style.borderColor = 'var(--hairline)';
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/Button.jsx", error: String((e && e.message) || e) }); }

// components/buttons/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IconButton — circular icon / carousel control.
 * White fill, 1px hairline, fully circular. Houses a single icon.
 */
function IconButton({
  children,
  size = 36,
  disabled = false,
  onClick,
  'aria-label': ariaLabel,
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    "aria-label": ariaLabel,
    disabled: disabled,
    onClick: onClick,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      padding: 0,
      background: 'var(--canvas-elevated)',
      color: 'var(--text-ink)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--radius-full)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      transition: 'border-color 0.15s ease, background 0.15s ease',
      ...style
    },
    onMouseEnter: e => {
      if (!disabled) e.currentTarget.style.borderColor = 'var(--text-faint)';
    },
    onMouseLeave: e => {
      if (!disabled) e.currentTarget.style.borderColor = 'var(--hairline)';
    }
  }, rest), children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Badge — compact status / label pill. Subtle (grey) by default; tone maps to
 * the semantic ladder. Used for tags, statuses, and metadata chips.
 */
function Badge({
  children,
  tone = 'neutral',
  style = {},
  ...rest
}) {
  const tones = {
    neutral: {
      bg: 'var(--hairline-soft)',
      fg: 'var(--text-body)',
      bd: 'var(--hairline)'
    },
    ink: {
      bg: 'var(--ink)',
      fg: 'var(--on-primary)',
      bd: 'var(--ink)'
    },
    link: {
      bg: 'var(--link-soft)',
      fg: 'var(--link-deep)',
      bd: 'transparent'
    },
    success: {
      bg: 'var(--link-soft)',
      fg: 'var(--link-deep)',
      bd: 'transparent'
    },
    warning: {
      bg: 'var(--warning-soft)',
      fg: 'var(--warning-deep)',
      bd: 'transparent'
    },
    error: {
      bg: '#ffe5e5',
      fg: 'var(--error-deep)',
      bd: 'transparent'
    }
  };
  const t = tones[tone] || tones.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      height: '24px',
      padding: '0 10px',
      background: t.bg,
      color: t.fg,
      border: `1px solid ${t.bd}`,
      borderRadius: 'var(--radius-full)',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--body-sm-size)',
      fontWeight: 'var(--weight-medium)',
      lineHeight: 1,
      whiteSpace: 'nowrap',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Badge.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Input — default Geist form field. White fill, 1px hairline, 6px radius.
 * Focus brings up the Vercel-blue ring; error swaps to the error tier.
 */
function Input({
  value,
  defaultValue,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
  error = false,
  label,
  prefix,
  style = {},
  ...rest
}) {
  const [focused, setFocused] = React.useState(false);
  const ringColor = error ? 'var(--error)' : 'var(--ink)';
  const field = /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-xs)',
      height: '40px',
      padding: '0 12px',
      background: 'var(--canvas-elevated)',
      border: `1px solid ${error ? 'var(--error)' : focused ? 'var(--ink)' : 'var(--hairline)'}`,
      borderRadius: 'var(--radius-sm)',
      boxShadow: focused ? `0 0 0 1px ${ringColor}` : 'none',
      transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, prefix && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-mute)',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--body-md-size)'
    }
  }, prefix), /*#__PURE__*/React.createElement("input", _extends({
    type: type,
    value: value,
    defaultValue: defaultValue,
    onChange: onChange,
    placeholder: placeholder,
    disabled: disabled,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: {
      flex: 1,
      minWidth: 0,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--body-md-size)',
      lineHeight: 'var(--body-md-line)',
      color: 'var(--text-ink)'
    }
  }, rest)));
  if (!label) return field;
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-xs)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--body-sm-size)',
      fontWeight: 'var(--weight-medium)',
      color: 'var(--text-body)'
    }
  }, label), field);
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card — the workhorse hairline content tile.
 * Flat by default (1px hairline, no shadow); elevation="whisper"|"floating"
 * adds the layered low-alpha shadow. radius defaults to md (12px); pricing
 * cards use lg (16px).
 */
function Card({
  children,
  elevation = 'flat',
  radius = 'md',
  padding = 'var(--space-lg)',
  style = {},
  ...rest
}) {
  const shadow = {
    flat: 'var(--shadow-flat)',
    whisper: 'var(--shadow-whisper)',
    floating: 'var(--shadow-floating)'
  }[elevation];
  const radii = {
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)'
  }[radius] || radius;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: 'var(--canvas-elevated)',
      border: '1px solid var(--hairline)',
      borderRadius: radii,
      boxShadow: shadow,
      padding,
      color: 'var(--text-ink)',
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Card.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/CodeBlock.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * CodeBlock — code / terminal surface. White fill, 1px hairline, 12px radius,
 * Geist Mono. An optional title bar carries traffic-light dots + a filename.
 */
function CodeBlock({
  children,
  filename,
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: 'var(--canvas-elevated)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      ...style
    }
  }, rest), filename && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-xs)',
      padding: '10px 14px',
      borderBottom: '1px solid var(--hairline)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: '#ff5f56'
    }
  }), /*#__PURE__*/React.createElement("i", {
    style: {
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: '#ffbd2e'
    }
  }), /*#__PURE__*/React.createElement("i", {
    style: {
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: '#27c93f'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--body-sm-size)',
      color: 'var(--text-mute)',
      marginLeft: 6
    }
  }, filename)), /*#__PURE__*/React.createElement("pre", {
    style: {
      margin: 0,
      padding: 'var(--space-md)',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--code-size)',
      lineHeight: 'var(--code-line)',
      color: 'var(--text-ink)',
      overflowX: 'auto',
      whiteSpace: 'pre'
    }
  }, children));
}
Object.assign(__ds_scope, { CodeBlock });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/CodeBlock.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/CTA.jsx
try { (() => {
// Black-text CTA band + grey multi-column footer.
function CTA() {
  const {
    Button
  } = window.VercelGeistDesignSystem_c2ba0d;
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: 'var(--canvas)',
      padding: '96px 24px',
      textAlign: 'center',
      borderBottom: '1px solid var(--hairline)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      fontSize: 48,
      lineHeight: '48px',
      letterSpacing: '-2.4px',
      color: 'var(--text-ink)',
      margin: '0 0 16px'
    }
  }, "Ready to deploy?"), /*#__PURE__*/React.createElement("p", {
    className: "t-body-lg",
    style: {
      margin: '0 auto 32px',
      maxWidth: 460
    }
  }, "Start building with a free account. Speak to an expert for your Pro or Enterprise needs."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg"
  }, "Start Deploying"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "lg"
  }, "Get a Demo")));
}
window.CTA = CTA;
function Footer() {
  const cols = {
    Products: ['Previews', 'AI', 'Edge Functions', 'Observability'],
    Resources: ['Docs', 'Guides', 'Help', 'Blog'],
    Company: ['About', 'Careers', 'Customers', 'Contact'],
    Legal: ['Privacy', 'Terms', 'DPA', 'SOC 2']
  };
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: 'var(--canvas)',
      padding: '64px 24px',
      borderTop: '1px solid var(--hairline)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1200,
      margin: '0 auto',
      display: 'grid',
      gridTemplateColumns: '1.5fr repeat(4, 1fr)',
      gap: 32
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "19",
    viewBox: "0 0 76 65"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M37.5274 0L75.0548 65H0L37.5274 0Z",
    fill: "#171717"
  })), /*#__PURE__*/React.createElement("p", {
    className: "t-body-sm",
    style: {
      marginTop: 16,
      color: 'var(--text-mute)'
    }
  }, "\xA9 2026 Vercel Inc.")), Object.entries(cols).map(([head, items]) => /*#__PURE__*/React.createElement("div", {
    key: head
  }, /*#__PURE__*/React.createElement("p", {
    className: "t-mono-eyebrow",
    style: {
      marginBottom: 16
    }
  }, head), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, items.map(i => /*#__PURE__*/React.createElement("a", {
    key: i,
    href: "#",
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 14,
      color: 'var(--text-body)',
      textDecoration: 'none'
    },
    onMouseEnter: e => e.currentTarget.style.color = 'var(--text-ink)',
    onMouseLeave: e => e.currentTarget.style.color = 'var(--text-body)'
  }, i)))))));
}
window.Footer = Footer;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/CTA.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Features.jsx
try { (() => {
// Feature card grid + a code-editor band.
function Features() {
  const {
    Card
  } = window.VercelGeistDesignSystem_c2ba0d;
  const items = [{
    eyebrow: 'Develop',
    title: 'Preview every push',
    body: 'Automatic preview deployments for every git branch and pull request.'
  }, {
    eyebrow: 'Preview',
    title: 'Collaborate in context',
    body: 'Comment directly on deploy previews and resolve feedback in one place.'
  }, {
    eyebrow: 'Ship',
    title: 'Go global instantly',
    body: 'Ship to the edge network in 100+ regions with zero configuration.'
  }];
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: 'var(--canvas)',
      padding: '96px 24px',
      borderBottom: '1px solid var(--hairline)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1200,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "t-mono-eyebrow",
    style: {
      marginBottom: 12
    }
  }, "Develop \xB7 Preview \xB7 Ship"), /*#__PURE__*/React.createElement("h2", {
    className: "t-heading-lg",
    style: {
      margin: '0 0 48px',
      maxWidth: 560
    }
  }, "The complete platform for the web."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 16
    }
  }, items.map(it => /*#__PURE__*/React.createElement(Card, {
    key: it.title,
    padding: "var(--space-xl)"
  }, /*#__PURE__*/React.createElement("div", {
    className: "t-mono-eyebrow",
    style: {
      marginBottom: 16
    }
  }, it.eyebrow), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--hairline)',
      margin: '0 0 16px'
    }
  }), /*#__PURE__*/React.createElement("h3", {
    className: "t-heading-md",
    style: {
      margin: '0 0 8px'
    }
  }, it.title), /*#__PURE__*/React.createElement("p", {
    className: "t-body-md",
    style: {
      margin: 0
    }
  }, it.body))))));
}
window.Features = Features;

// Code-editor band — install + deploy in two lines.
function CodeBand() {
  const {
    CodeBlock
  } = window.VercelGeistDesignSystem_c2ba0d;
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: 'var(--hairline-soft)',
      padding: '96px 24px',
      borderBottom: '1px solid var(--hairline)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 760,
      margin: '0 auto',
      display: 'grid',
      gap: 32,
      gridTemplateColumns: '1fr',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "t-mono-eyebrow",
    style: {
      marginBottom: 12
    }
  }, "Zero config"), /*#__PURE__*/React.createElement("h2", {
    className: "t-heading-lg",
    style: {
      margin: '0 auto 12px',
      maxWidth: 520
    }
  }, "Your first deploy is one command away."), /*#__PURE__*/React.createElement("p", {
    className: "t-body-lg",
    style: {
      margin: '0 auto',
      maxWidth: 480
    }
  }, "Connect your repository and Vercel handles the build, the CDN, and TLS.")), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement(CodeBlock, {
    filename: "~/acme-app"
  }, `$ npm i -g vercel
$ vercel deploy

🔍  Inspecting acme-app...
📦  Building...
✅  Production: https://acme-app.vercel.app [2s]`))));
}
window.CodeBand = CodeBand;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Features.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Hero.jsx
try { (() => {
// Hero band — mesh gradient bloom behind a tightly-tracked display headline.
function Hero() {
  const {
    Button
  } = window.VercelGeistDesignSystem_c2ba0d;
  return /*#__PURE__*/React.createElement("section", {
    style: {
      position: 'relative',
      overflow: 'hidden',
      background: 'var(--canvas)',
      borderBottom: '1px solid var(--hairline)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      opacity: 0.5,
      filter: 'blur(60px)',
      background: 'var(--mesh-gradient)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      maxWidth: 1000,
      margin: '0 auto',
      padding: '120px 24px 96px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "t-mono-eyebrow",
    style: {
      marginBottom: 20
    }
  }, "The Frontend Cloud"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      color: 'var(--text-ink)',
      fontSize: 72,
      lineHeight: '72px',
      letterSpacing: '-4px',
      margin: '0 0 24px',
      textWrap: 'balance'
    }
  }, "Build and deploy", /*#__PURE__*/React.createElement("br", null), "on the AI Cloud."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 20,
      lineHeight: '30px',
      color: 'var(--text-body)',
      maxWidth: 620,
      margin: '0 auto 40px'
    }
  }, "Vercel gives developers the frameworks, workflows, and infrastructure to build a faster, more personalized web."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg"
  }, "Start Deploying"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "lg"
  }, "Get a Demo"))));
}
window.Hero = Hero;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Hero.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/LogoStrip.jsx
try { (() => {
// Greyscale customer logo strip.
function LogoStrip() {
  const logos = ['Notion', 'OpenAI', 'Stripe', 'Adobe', 'Under Armour', 'eBay', 'Nintendo'];
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: 'var(--canvas)',
      borderBottom: '1px solid var(--hairline)',
      padding: '32px 24px'
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "t-mono-eyebrow",
    style: {
      textAlign: 'center',
      marginBottom: 24
    }
  }, "Trusted by the best frontend teams"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 48,
      justifyContent: 'center',
      flexWrap: 'wrap',
      alignItems: 'center'
    }
  }, logos.map(l => /*#__PURE__*/React.createElement("span", {
    key: l,
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 22,
      fontWeight: 600,
      letterSpacing: '-0.6px',
      color: 'var(--text-mute)',
      opacity: 0.8
    }
  }, l))));
}
window.LogoStrip = LogoStrip;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/LogoStrip.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Nav.jsx
try { (() => {
// Top navigation — black wordmark, ghost links, Sign Up / Log In square buttons.
function Nav() {
  const {
    Button
  } = window.VercelGeistDesignSystem_c2ba0d;
  const links = ['Products', 'Solutions', 'Resources', 'Enterprise', 'Docs', 'Pricing'];
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-lg)',
      height: 64,
      padding: '0 24px',
      background: 'var(--canvas)',
      borderBottom: '1px solid var(--hairline)',
      position: 'sticky',
      top: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      textDecoration: 'none'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "19",
    viewBox: "0 0 76 65",
    "aria-label": "Vercel"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M37.5274 0L75.0548 65H0L37.5274 0Z",
    fill: "#171717"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 20,
      fontWeight: 600,
      letterSpacing: '-0.5px',
      color: 'var(--text-ink)'
    }
  }, "Vercel")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 2,
      marginLeft: 8
    }
  }, links.map(l => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: "#",
    style: {
      padding: '8px 12px',
      borderRadius: 'var(--radius-full)',
      fontFamily: 'var(--font-sans)',
      fontSize: 14,
      color: 'var(--text-body)',
      textDecoration: 'none'
    },
    onMouseEnter: e => e.currentTarget.style.color = 'var(--text-ink)',
    onMouseLeave: e => e.currentTarget.style.color = 'var(--text-body)'
  }, l))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm"
  }, "Log In"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm"
  }, "Sign Up")));
}
window.Nav = Nav;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Nav.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Pricing.jsx
try { (() => {
// Pricing tier grid — three hairline cards, the middle one highlighted.
function Pricing() {
  const {
    Card,
    Button,
    Badge
  } = window.VercelGeistDesignSystem_c2ba0d;
  const tiers = [{
    name: 'Hobby',
    price: '$0',
    sub: 'For personal projects',
    cta: 'Start Deploying',
    variant: 'secondary',
    feats: ['Automatic CI/CD', '100 GB bandwidth', 'Preview deployments', 'Community support']
  }, {
    name: 'Pro',
    price: '$20',
    sub: 'Per user / month',
    cta: 'Start a Free Trial',
    variant: 'primary',
    highlight: true,
    feats: ['Everything in Hobby', '1 TB bandwidth', 'Edge Functions', 'Email + chat support', 'Advanced analytics']
  }, {
    name: 'Enterprise',
    price: 'Custom',
    sub: 'For large organizations',
    cta: 'Contact Sales',
    variant: 'secondary',
    feats: ['Everything in Pro', 'SAML SSO', 'Dedicated support', '99.99% SLA', 'Managed onboarding']
  }];
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: 'var(--canvas)',
      padding: '96px 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1100,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginBottom: 48
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "t-mono-eyebrow",
    style: {
      marginBottom: 12
    }
  }, "Pricing"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      fontSize: 48,
      lineHeight: '48px',
      letterSpacing: '-2.4px',
      color: 'var(--text-ink)',
      margin: '0 0 12px'
    }
  }, "Find a plan to power your projects."), /*#__PURE__*/React.createElement("p", {
    className: "t-body-lg",
    style: {
      margin: 0
    }
  }, "Start for free. Upgrade as you grow.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 16,
      alignItems: 'start'
    }
  }, tiers.map(t => /*#__PURE__*/React.createElement(Card, {
    key: t.name,
    radius: "lg",
    padding: "var(--space-xl)",
    elevation: t.highlight ? 'floating' : 'flat',
    style: t.highlight ? {
      borderColor: 'var(--ink)'
    } : {}
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("h3", {
    className: "t-heading-md",
    style: {
      margin: 0
    }
  }, t.name), t.highlight && /*#__PURE__*/React.createElement(Badge, {
    tone: "ink"
  }, "Popular")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 6,
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      fontSize: 40,
      letterSpacing: '-1.6px',
      color: 'var(--text-ink)'
    }
  }, t.price)), /*#__PURE__*/React.createElement("p", {
    className: "t-body-sm",
    style: {
      color: 'var(--text-mute)',
      margin: '0 0 24px'
    }
  }, t.sub), /*#__PURE__*/React.createElement(Button, {
    variant: t.variant,
    size: "lg",
    style: {
      width: '100%'
    }
  }, t.cta), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--hairline)',
      margin: '24px 0'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, t.feats.map(f => /*#__PURE__*/React.createElement("div", {
    key: f,
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--link)",
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "20 6 9 17 4 12"
  })), /*#__PURE__*/React.createElement("span", {
    className: "t-body-md",
    style: {
      color: 'var(--text-ink)'
    }
  }, f)))))))));
}
window.Pricing = Pricing;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Pricing.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.CodeBlock = __ds_scope.CodeBlock;

})();
