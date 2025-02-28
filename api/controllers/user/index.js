const db_helper = require('../../general/db-helper')
const user_helper = require('./user-helper')
const { v4: uuidv4 } = require('uuid');

exports.ping = async (req, res) => {
    const user = req.user //This is set by the middleware
    try {
        return res.status(200).json({
            status: 'success',
            message: '',
            appInfo: {
                version: "1.0.1"
            }
        })

    } catch (error) {
        console.log(error)
        return res.status(500).json({
            status: 'internal_error',
            message: 'We have encountered an embarassing internal error while trying to process this request. We have been notified and are looking into it.'
        })
    }
}

exports.query = async (req, res) => {
    const user = req.user
    try {
        const {query, schema, conversation_id } = req.body
        if (!query || !schema) {
            return res.status(400).json({
                status: 'request_error',
                message: 'You must provide both a query and schema.'
            })
        }

        if (conversation_id) {
            //Validate conversation id
        }
        const message_id = `msg_${uuidv4()}`
        const conv_id = conversation_id || `conversation_${uuidv4()}`
        const messages = await db_helper.getMessages({
            user_id: user.user_id,
            conversation_id: conv_id
        })
        const history = formatMessageHistory(messages)
        await db_helper.storeMessage({
            user_id: user.user_id,
            message_id: message_id,
            conversation_id: conv_id,
            message: query,
            sender: 'user'
        })
        const response = await user_helper.queryModel(query, schema, history)
        const model_response = JSON.parse(response)
   

        const message_id2 = `msg_${uuidv4()}`
        await db_helper.storeMessage({
            user_id: user.user_id,
            message_id: message_id2,
            conversation_id: conv_id,
            message: model_response.sqlQuery || model_response.agentResponse,
            sender: 'ai'
        })

        if (model_response.isValidRequest == true) {
            return res.status(200).json({
                status: 'success',
                message: '',
                aiResponse: {
                    query: model_response.sqlQuery,
                    agentResponse: model_response.agentResponse,
                    conversationId: conv_id
                }
            })
        } else {
            return res.status(400).json({
                status: 'request_error',
                message: model_response.agentResponse
            })
        }

    } catch (error) {
        console.log(error)
        return res.status(500).json({
            status: 'internal_error',
            message: 'We have encountered an embarassing internal error while trying to process this request. We have been notified and are looking into it.'
        })  
    }
}

exports.register_device = async (req, res) => {
   const { device_id, license_key } = req.body
   const now = new Date().toISOString().slice(0, 19).replace("T", " ");
   console.log(license_key)
   try {
    if (!device_id || !license_key) {
        return res.status(400).json({
            status: 'request_error',
            message: 'Encountered an error while trying to activate your license.'
        })
    }
    const user = await db_helper.getUser(null, null, license_key)
    if (!user) {
        return res.status(400).json({
            status: 'activation_error',
            message: 'This license key is invalid.'
        })  
    }

    if (user.machine_id) {
        return res.status(400).json({
            status: 'activation_error',
            message: 'This license key has already been used.'
        })   
    }

    //Activate license here
    await db_helper.updateUser(user.user_id, {
        license_key: license_key,
        machine_id: device_id,
        activated_at: now
    })


    return res.status(200).json({
        status: 'success',
        message: 'Licanse successfully activated.'
    })
   } catch (error) {
    return res.status(500).json({
        status: 'internal_error',
        message: 'We have encountered an internal error while trying to process this request. We have been notified and are looking into it.'
    })   
   }
}

exports.get_feature_flags = async (req, res) => {
    const userInfo = req.user // Set by middleware
    try {
        const flags = await user_helper.getFeatureFlags(userInfo.user_id)
        if (!flags) {
            return res.status(400).json({
                status: 'request_error',
                message: 'Encountered an error while fetching feature flags.'
            })
        }

        return res.status(200).json({
            status: 'success',
            message: '',
            flags: flags
        })
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            status: 'internal_error',
            message: 'We have encountered an embarrassing internal error while trying to process this request. We have been notified and are looking into it.'
        })   
    }
}



function formatMessageHistory(messages) {
    // Sort messages by creation time (oldest first) for proper conversation order
    const sortedMessages = [...messages].sort((a, b) => 
      new Date(a.created_at) - new Date(b.created_at)
    );
    
    // Map each message to the AI-friendly format
    return sortedMessages.map(message => {
      // Map 'sender' values to expected role values
      const role = message.sender === 'user' ? 'user' : 'assistant';
      
      return {
        role: role,
        content: message.message
      };
    });
  }