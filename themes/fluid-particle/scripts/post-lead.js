'use strict'

const { extractPostLead } = require('./post-lead-core')

hexo.extend.helper.register('post_lead', extractPostLead)
