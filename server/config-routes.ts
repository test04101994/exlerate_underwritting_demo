/**
 * Configuration API routes for serving JSON form configurations
 */

import { Express } from 'express';
import path from 'path';
import fs from 'fs/promises';

export function registerConfigRoutes(app: Express) {
  // Get form configuration
  app.get('/api/config/:formType', async (req, res) => {
    try {
      const { formType } = req.params;
      const configPath = path.join(process.cwd(), 'core/config/interfaces', `${formType}.json`);
      
      const configData = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configData);
      
      res.json(config);
    } catch (error) {
      console.error('Error loading form configuration:', error);
      res.status(404).json({ error: 'Configuration not found' });
    }
  });

  // Update form configuration
  app.put('/api/config/:formType', async (req, res) => {
    try {
      const { formType } = req.params;
      const configPath = path.join(process.cwd(), 'core/config/interfaces', `${formType}.json`);
      
      const configData = JSON.stringify(req.body, null, 2);
      await fs.writeFile(configPath, configData);
      
      res.json({ success: true, message: 'Configuration updated successfully' });
    } catch (error) {
      console.error('Error updating form configuration:', error);
      res.status(500).json({ error: 'Failed to update configuration' });
    }
  });

  // Get all available form configurations
  app.get('/api/config', async (req, res) => {
    try {
      const configDir = path.join(process.cwd(), 'core/config/interfaces');
      const files = await fs.readdir(configDir);
      
      const configs = await Promise.all(
        files
          .filter(file => file.endsWith('.json'))
          .map(async file => {
            const configPath = path.join(configDir, file);
            const configData = await fs.readFile(configPath, 'utf-8');
            const config = JSON.parse(configData);
            
            return {
              id: path.basename(file, '.json'),
              title: config.title,
              version: config.version,
              formId: config.formId,
              sectionsCount: config.sections.length,
              fieldsCount: config.sections.reduce((acc, section) => acc + section.fields.length, 0)
            };
          })
      );
      
      res.json(configs);
    } catch (error) {
      console.error('Error loading configurations:', error);
      res.status(500).json({ error: 'Failed to load configurations' });
    }
  });

  // Create new form configuration
  app.post('/api/config/:formType', async (req, res) => {
    try {
      const { formType } = req.params;
      const configPath = path.join(process.cwd(), 'core/config/interfaces', `${formType}.json`);
      
      // Check if configuration already exists
      try {
        await fs.access(configPath);
        return res.status(409).json({ error: 'Configuration already exists' });
      } catch {
        // File doesn't exist, continue with creation
      }
      
      const configData = JSON.stringify(req.body, null, 2);
      await fs.writeFile(configPath, configData);
      
      res.json({ success: true, message: 'Configuration created successfully' });
    } catch (error) {
      console.error('Error creating form configuration:', error);
      res.status(500).json({ error: 'Failed to create configuration' });
    }
  });

  // Delete form configuration
  app.delete('/api/config/:formType', async (req, res) => {
    try {
      const { formType } = req.params;
      const configPath = path.join(process.cwd(), 'core/config/interfaces', `${formType}.json`);
      
      await fs.unlink(configPath);
      
      res.json({ success: true, message: 'Configuration deleted successfully' });
    } catch (error) {
      console.error('Error deleting form configuration:', error);
      res.status(500).json({ error: 'Failed to delete configuration' });
    }
  });

  // Validate configuration
  app.post('/api/config/:formType/validate', async (req, res) => {
    try {
      const { formConfigSchema } = await import('../shared/configurable-forms');
      
      const validation = formConfigSchema.safeParse(req.body);
      
      if (validation.success) {
        res.json({ valid: true, message: 'Configuration is valid' });
      } else {
        res.json({ 
          valid: false, 
          errors: validation.error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message
          }))
        });
      }
    } catch (error) {
      console.error('Error validating configuration:', error);
      res.status(500).json({ error: 'Failed to validate configuration' });
    }
  });
}