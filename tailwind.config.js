/** @type {import('tailwindcss').Config} */
export default {
	content: [
		"./index.html",
		"./src/**/*.{js,ts,jsx,tsx}",
	],
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))'
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					foreground: 'hsl(var(--warning-foreground))'
				},
				info: {
					DEFAULT: 'hsl(var(--info))',
					foreground: 'hsl(var(--info-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			boxShadow: {
				// Material Design elevation shadows
				'elevation-0': 'none',
				'elevation-1': '0 1px 3px 0 rgba(0, 0, 0, 0.12), 0 1px 2px 0 rgba(0, 0, 0, 0.24)',
				'elevation-2': '0 3px 6px 0 rgba(0, 0, 0, 0.15), 0 2px 4px 0 rgba(0, 0, 0, 0.12)',
				'elevation-3': '0 10px 20px 0 rgba(0, 0, 0, 0.15), 0 3px 6px 0 rgba(0, 0, 0, 0.10)',
				'elevation-4': '0 15px 25px 0 rgba(0, 0, 0, 0.15), 0 5px 10px 0 rgba(0, 0, 0, 0.05)',
				'elevation-6': '0 20px 40px 0 rgba(0, 0, 0, 0.15)',
				'elevation-8': '0 25px 50px 0 rgba(0, 0, 0, 0.15)',
				'elevation-12': '0 30px 60px 0 rgba(0, 0, 0, 0.15)',
				'elevation-16': '0 35px 70px 0 rgba(0, 0, 0, 0.15)',
				'elevation-24': '0 40px 80px 0 rgba(0, 0, 0, 0.15)',
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: 0
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: 0
					}
				},
				'fade-in': {
					from: {
						opacity: 0
					},
					to: {
						opacity: 1
					}
				},
				'fade-out': {
					from: {
						opacity: 1
					},
					to: {
						opacity: 0
					}
				},
				'slide-in-up': {
					from: {
						transform: 'translateY(100%)',
						opacity: 0
					},
					to: {
						transform: 'translateY(0)',
						opacity: 1
					}
				},
				'slide-in-down': {
					from: {
						transform: 'translateY(-100%)',
						opacity: 0
					},
					to: {
						transform: 'translateY(0)',
						opacity: 1
					}
				},
				'scale-in': {
					from: {
						transform: 'scale(0.95)',
						opacity: 0
					},
					to: {
						transform: 'scale(1)',
						opacity: 1
					}
				},
				'ripple': {
					'0%': {
						transform: 'scale(0)',
						opacity: 1
					},
					'100%': {
						transform: 'scale(4)',
						opacity: 0
					}
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'fade-in': 'fade-in 0.2s ease-out',
				'fade-out': 'fade-out 0.2s ease-out',
				'slide-in-up': 'slide-in-up 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
				'slide-in-down': 'slide-in-down 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
				'scale-in': 'scale-in 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
				'ripple': 'ripple 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
			},
			transitionTimingFunction: {
				'material-standard': 'cubic-bezier(0.4, 0.0, 0.2, 1)',
				'material-decelerate': 'cubic-bezier(0.0, 0.0, 0.2, 1)',
				'material-accelerate': 'cubic-bezier(0.4, 0.0, 1, 1)',
				'material-sharp': 'cubic-bezier(0.4, 0.0, 0.6, 1)',
			},
			transitionDuration: {
				'material-shortest': '150ms',
				'material-shorter': '200ms',
				'material-short': '250ms',
				'material-standard': '300ms',
				'material-complex': '375ms',
				'material-entering': '225ms',
				'material-leaving': '195ms',
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
}
