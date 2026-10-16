# Markdown is the stored format for descriptions and comments

Descriptions and comments are stored as markdown and edited in Tiptap, which round-trips to markdown. Agents read and write markdown natively, the API stays plain text, and exports need no conversion. We accept losing editor features that markdown cannot represent. Storing the editor's JSON was richer but would have forced every agent through a conversion step.
