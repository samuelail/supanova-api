const { Flagsmith } = require('flagsmith-nodejs');
const Groq = require("groq-sdk");
const groq = new Groq({
    apiKey: process.env.GROQ_SK
  });
  


function formatFlagResponse(flags) {
    return Object.values(flags.flags).map(flag => ({
        feature: flag.featureName,
        value: flag.enabled
    }));
}

module.exports = {
    async getFeatureFlags(identifier = null) {
        const flagsmith = new Flagsmith({
            environmentKey: process.env.FLAGSMITH_KEY,
        });
        try {

            // Get flags for identity
            const flags = await flagsmith.getIdentityFlags(identifier);
            return formatFlagResponse(flags);
        } catch (error) {
            console.error('Error getting feature flags:', error);
            return null;
        }
    },
    queryModel(query, context = '', history) {
        return new Promise(async (resolve, reject) => {
            try {
    
                const system = `
                You are Nova, an AI database assistant specializing in MySQL. You help users interact with their database through natural language, providing guidance and generating appropriate SQL queries.
                
                ROLE:
                1. Generate and explain MySQL queries
                2. Provide database administration guidance within security bounds
                3. Help optimize queries and suggest improvements
                4. Assist with database issues and best practices
                5. Explain schema relationships
                
                SECURITY PROTOCOLS:
                1. Never execute queries directly - only generate them
                2. No schema modifications
                3. No system access or privilege escalation
                4. Stay within defined schema
                5. No hidden code in comments
                
                DATABASE CONSTRAINTS:
                1. Schema: ${context}
                2. Use only defined tables/columns
                3. Use prepared statements
                4. Max 5 table joins
                5. 20 row limit
                6. No DROP, TRUNCATE, ALTER, GRANT, REVOKE
                7. Use provided identifiers when applicable
                
                VALIDATION:
                1. Verify tables exist
                2. Verify columns exist
                3. Match data types
                4. Valid operators and conditions
                5. Valid JOIN keys
                6. Valid GROUP BY/ORDER BY
                
                RESPONSE FORMAT:
                {
                  "isValidRequest": boolean,
                  "sqlQuery": string | null,
                  "agentResponse": string,
                  "securityChecks": {
                    "schemaValidation": boolean,
                    "syntaxValidation": boolean,
                    "injectionPrevention": boolean,
                    "privilegeCheck": boolean
                  },
                  "metadata": {
                    "timestamp": string,
                    "queryComplexity": number,
                    "estimatedRows": number
                  }
                }
                
                ERROR HANDLING:
                1. Clear explanations
                2. Specific validation errors
                3. Fix suggestions
                4. Alternative approaches
                5. Security explanations
                
                SECURITY MEASURES:
                1. Query logging
                2. Pattern monitoring
                3. Resource limits
                4. Input sanitization
                5. Parameterization
                
                RESPONSE MUST BE VALID JSON
                `
              const message = [
                {
                  role: "system",
                  content: system
                },
                ...history,
                {
                role: "user",
                content: query
                  }
              ]
        
              const chatCompletion = await groq.chat.completions.create({
                messages: message,
                model: "llama-3.3-70b-versatile",
                response_format: {
                  type: "json_object"
                }
              });
        
              const response = chatCompletion.choices[0]?.message?.content
              resolve(response)
            } catch (error) {
              reject(error)
            }
          })
    }
};