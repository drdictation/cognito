'use server'

import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

export async function triggerIngestion() {
    try {
        // Resolve paths relative to the dashboard directory
        // We assume the verified structure:
        // cognito/
        //   dashboard/
        //   venv/
        //   src/scripts/ingest_hub.py

        // Go up one level from dashboard root
        const projectRoot = path.resolve(process.cwd(), '..')
        const pythonPath = path.join(projectRoot, 'venv/bin/python')
        const scriptPath = path.join(projectRoot, 'src/scripts/ingest_hub.py')

        console.log('🔄 Triggering ingestion...')
        console.log(`Command: ${pythonPath} ${scriptPath}`)

        const { stdout, stderr } = await execAsync(`"${pythonPath}" "${scriptPath}"`, {
            cwd: projectRoot, // Set execution directory to project root
            env: { ...process.env }, // Inherit env vars (like API keys) if needed
        })

        console.log('Ingestion output:', stdout)

        if (stderr) {
            console.warn('Ingestion stderr:', stderr)
        }

        return { success: true, message: 'Ingestion complete' }
    } catch (error: any) {
        console.error('Ingestion failed:', error)
        return {
            success: false,
            error: error.message || 'Failed to populate inbox'
        }
    }
}
