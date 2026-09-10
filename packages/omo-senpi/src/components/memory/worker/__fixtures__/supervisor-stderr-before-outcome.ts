console.error("diagnostic-noise:" + "x".repeat(2_048))
console.error("intentional supervisor pre-child failure")
throw new Error("intentional supervisor pre-child failure")
